import express, { type Request, type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { STUDY_COURSES } from "@digital-leadership/shared";
import { courseStudyRoutes } from "../../src/studyTools/courseStudyRoutes.js";
import { academicPresentation } from "../../src/middleware/academicPresentation.js";
import { AcademicSpeechUnavailable } from "../../src/examMaterials/academicSpeech.js";
import { HttpError } from "../../src/lib/httpError.js";
import { ValidationError } from "../../src/lib/validation.js";

const subject = STUDY_COURSES[0].id, lecture = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision = "b".repeat(64);
const path = `/subjects/${subject}/study-modules`;
function fixture(identity: "user" | "guest" | "anonymous" = "user", prepareWaitMs = 20_000) {
  let userId = "fixture", userStatus = "active";
  const documents = vi.fn().mockResolvedValue({ summaries: { subjectId: subject, transcript: "األمن", summarySha256: revision }, exam: { subjectId: subject } });
  const narration = vi.fn().mockResolvedValue({ bytes: Buffer.from("0123456789"), voice: "ar-IQ-BasselNeural" });
  const app = express();
  app.use((req, _res, next) => {
    // Local test principals only. Production authentication is unchanged.
    if (identity === "user") req.user = { id: userId, role: "student", status: userStatus } as NonNullable<Request["user"]>;
    if (identity === "guest") req.guestSession = { id: "fixture", status: "active" } as NonNullable<Request["guestSession"]>;
    next();
  });
  app.use(academicPresentation);
  app.use(courseStudyRoutes(() => ({ documents, narration }), prepareWaitMs));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => { res.status(error instanceof HttpError ? error.status : error instanceof ValidationError ? 400 : 500).json({ error: { code: error.code ?? "validation_error", message: error.message } }); };
  app.use(errors);
  return { app, documents, narration, setUser: (id: string, status = "active") => { userId = id; userStatus = status; } };
}
describe("protected all-course study routes", () => {
  it.each(["summaries", "exam", `${lecture}/audio.mp3?revision=${revision}&voice=msa-male`])("rejects anonymous %s before reading or synthesizing", async suffix => {
    const f = fixture("anonymous"); await request(f.app).get(`${path}/${suffix}`).expect(401);
    expect(f.documents).not.toHaveBeenCalled(); expect(f.narration).not.toHaveBeenCalled();
  });
  it.each(["user", "guest"] as const)("accepts a verified %s and keeps content-addressed text private and unchanged", async identity => {
    const f = fixture(identity), response = await request(f.app).get(`${path}/summaries`).expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data.transcript).toBe("األمن");
    expect(response.body.data.summarySha256).toBe(revision);
    expect(f.documents).toHaveBeenCalledWith(subject);
  });
  it("rejects invalid subject/lecture IDs and extra query data before using a provider", async () => {
    const f = fixture();
    for (const url of ["/subjects/not-a-uuid/study-modules/summaries", `${path}/summaries?text=untrusted`, `${path}/not-a-uuid/audio.mp3?revision=${revision}&voice=msa-male`, `${path}/${lecture}/audio.mp3?revision=${revision}&voice=unknown`, `${path}/${lecture}/audio.mp3?revision=${revision}&voice=msa-male&text=injected`, `${path}/${lecture}/audio.mp3?revision=bad&voice=msa-male`]) await request(f.app).get(url).expect(400);
    expect(f.documents).not.toHaveBeenCalled(); expect(f.narration).not.toHaveBeenCalled();
  });
  it("serves the requested voice, standard and suffix ranges, and rejects unsatisfiable ranges", async () => {
    const f = fixture(), url = `${path}/${lecture}/audio.mp3?revision=${revision}&voice=iraqi-male`;
    const full = await request(f.app).get(url).expect(200);
    expect(full.headers["content-type"]).toContain("audio/mpeg");
    expect(full.headers["x-audio-voice"]).toBe("ar-IQ-BasselNeural");
    const partial = await request(f.app).get(url).set("Range", "bytes=2-4").expect(206);
    expect(partial.headers["content-range"]).toBe("bytes 2-4/10");
    expect(partial.body).toEqual(Buffer.from("234"));
    const suffix = await request(f.app).get(url).set("Range", "bytes=-2").expect(206);
    expect(suffix.body).toEqual(Buffer.from("89"));
    await request(f.app).get(url).set("Range", "bytes=10-").expect(416);
    expect(f.narration).toHaveBeenCalledWith(subject, lecture, revision, "iraqi-male", expect.any(AbortSignal));
  });
  it("rejects malformed ranges before speech generation and returns a retryable provider failure", async () => {
    const f = fixture(), url = `${path}/${lecture}/audio.mp3?revision=${revision}&voice=msa-male`;
    await request(f.app).get(url).set("Range", "bytes=0-1,4-5").expect(400);
    expect(f.narration).not.toHaveBeenCalled();
    f.narration.mockRejectedValueOnce(new AcademicSpeechUnavailable("provider_timeout"));
    const response = await request(f.app).get(url).expect(503);
    expect(response.body.error.code).toBe("audio_unavailable");
    expect(response.body.error.message).toContain("أعد المحاولة");
  });
  it("bounds cold lecture audio with an explicit preparation response before serving a ready range", async () => {
    const f = fixture("user", 10), url = `${path}/${lecture}/audio.mp3?revision=${revision}&voice=iraqi-male`;
    let finish!: () => void;
    const work = new Promise<{ bytes: Buffer; voice: string }>(resolve => { finish = () => resolve({ bytes: Buffer.from("0123456789"), voice: "ar-IQ-BasselNeural" }); });
    let release: NodeJS.Timeout | undefined;
    f.narration.mockImplementation(() => { release ??= setTimeout(finish, 100); return work; });
    // Release the external boundary even on the old implementation: its
    // observable defect is a late 200 instead of the bounded 503 response.
    try {
      const preparing = await request(f.app).get(url).expect(503);
      expect(preparing.body.error.code).toBe("audio_preparing");
      expect(preparing.headers["retry-after"]).toBe("10");
      expect(preparing.headers["cache-control"]).toBe("private, no-store");
      finish();
      const ready = await request(f.app).get(url).set("Range", "bytes=2-4").expect(206);
      expect(ready.body).toEqual(Buffer.from("234"));
      expect(ready.headers["x-audio-voice"]).toBe("ar-IQ-BasselNeural");
      expect(ready.headers["content-range"]).toBe("bytes 2-4/10");
    } finally { clearTimeout(release); finish(); }
  });
  it("propagates a stale-source conflict and a hidden course instead of exposing other content", async () => {
    const f = fixture();
    f.documents.mockRejectedValueOnce(new HttpError(404, "not_found", "Subject not found."));
    await request(f.app).get(`${path}/exam`).expect(404);
    f.narration.mockRejectedValueOnce(new HttpError(409, "conflict", "تغير ملخص المحاضرة."));
    await request(f.app).get(`${path}/${lecture}/audio.mp3?revision=${revision}&voice=msa-male`).expect(409);
  });
  it("does not let one learner exhaust another learner's audio budget on a shared network", async () => {
    const f = fixture(), url = `${path}/${lecture}/audio.mp3?revision=${revision}&voice=msa-male`;
    for (let index = 0; index < 12; index++) await request(f.app).get(url).expect(200);
    await request(f.app).get(url).expect(429);
    f.setUser("another-verified-learner");
    await request(f.app).get(url).expect(200);
  });
  it("answers a still-preparing course with a retryable 503 instead of holding the page, then serves it", async () => {
    let finish!: (value: unknown) => void;
    const documents = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ summaries: { subjectId: subject }, exam: { subjectId: subject } });
    const app = express();
    app.use((req, _res, next) => { req.user = { id: "fixture", role: "student", status: "active" } as NonNullable<Request["user"]>; next(); });
    app.use(courseStudyRoutes(() => ({ documents, narration: vi.fn() }), 50));
    app.use(((error, _req, res, _next) => { res.status(error.status ?? 500).json({ error: { code: error.code } }); }) as ErrorRequestHandler);
    const response = await request(app).get(`${path}/summaries`).expect(503);
    expect(response.body.error.code).toBe("study_module_preparing"); expect(response.headers["retry-after"]).toBe("10");
    finish({ summaries: { subjectId: subject }, exam: { subjectId: subject } });
    await request(app).get(`${path}/summaries`).expect(200);
  });
  it("rejects an inactive registered account before reading source content", async () => {
    const f = fixture(); f.setUser("inactive-fixture", "disabled");
    await request(f.app).get(`${path}/summaries`).expect(403);
    expect(f.documents).not.toHaveBeenCalled();
  });
});
