import express from "express";
import type { Request } from "express";
import request from "supertest";
import { PDFParse } from "pdf-parse";
import { describe, expect, it, vi } from "vitest";
import { weeklyExamRoutes } from "../../src/examMaterials/weeklyExamRoutes.js";
import { weeklyCyberSubjectId } from "../../src/examMaterials/weeklyCyberExams.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { notFound } from "../../src/lib/httpError.js";

function app(published = vi.fn().mockResolvedValue({})) {
  const instance = express(); instance.use(express.json());
  instance.use((req, _res, next) => {
    const principal = req.get("x-test-principal");
    if (principal === "guest") req.guestSession = { id: "test-guest" } as NonNullable<Request["guestSession"]>;
    else if (principal === "user" || principal === "admin" || principal === "disabled") req.user = { id: "test-user", role: principal === "admin" ? "admin" : "user", status: principal === "disabled" ? "disabled" : "active" } as NonNullable<Request["user"]>;
    next();
  });
  instance.use("/api/v1", weeklyExamRoutes(published)); instance.use(errorHandler); return instance;
}
const root = `/api/v1/subjects/${weeklyCyberSubjectId}/exam-material/weekly-tests`;
describe("published weekly assessment access and exports", () => {
  it("protects every paper, answer, check and PDF route from anonymous requests", async () => {
    const instance = app();
    for (const suffix of ["", "/week-1", "/week-1/solutions", "/week-1/paper.pdf"]) expect((await request(instance).get(root + suffix)).status).toBe(401);
    expect((await request(instance).post(root + "/week-1/check").send({ questionId: "week-1-q1", selectedIndex: 1 })).status).toBe(401);
  });
  it.each(["guest", "user", "admin"])("allows a %s to read published questions and explicitly request practice feedback", async principal => {
    const instance = app(), paper = await request(instance).get(root + "/week-1").set("x-test-principal", principal);
    expect(paper.status).toBe(200); expect(paper.headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(paper.body)).not.toMatch(/correctIndex|modelAnswer|rationale/);
    const check = await request(instance).post(root + "/week-1/check").set("x-test-principal", principal).send({ questionId: "week-1-q1", selectedIndex: 0 });
    expect(check.status).toBe(200); expect(check.body.data).toMatchObject({ isCorrect: false, correctIndex: 1 });
  });
  it("honors subject visibility and disabled identities before exposing any teaching key", async () => {
    const instance = app(vi.fn().mockRejectedValue(notFound("unpublished")));
    expect((await request(instance).get(root + "/week-1/solutions").set("x-test-principal", "admin")).status).toBe(404);
    expect((await request(app()).get(root + "/week-1/solutions").set("x-test-principal", "disabled")).status).toBe(403);
  });
  it("validates choices and rejects extra fields, cross-paper questions and unsafe export options", async () => {
    const instance = app();
    for (const body of [{ questionId: "week-1-q1" }, { questionId: "week-1-q1", selectedIndex: "1" }, { questionId: "week-3-q1", selectedIndex: 1 }, { questionId: "week-1-q1", selectedIndex: 1, correctIndex: 1 }])
      expect((await request(instance).post(root + "/week-1/check").set("x-test-principal", "guest").send(body)).status).toBeGreaterThanOrEqual(400);
    expect((await request(instance).get(root + "/week-1/paper.pdf?answers=all").set("x-test-principal", "user")).status).toBe(400);
  });
  it("exports searchable Arabic PDFs through the authorized route without names or the key in question-only mode", async () => {
    const instance = app();
    for (const includeAnswers of [false, true]) {
      const response = await request(instance).get(root + "/week-1/paper.pdf" + (includeAnswers ? "?answers=1" : "")).set("x-test-principal", "guest");
      expect(response.status).toBe(200); expect(response.headers["content-type"]).toContain("application/pdf");
      const parser = new PDFParse({ data: response.body });
      try {
        const text = (await parser.getText()).text.normalize("NFKC");
        expect(text).toContain("اختبارات د. ضياء الأسبوعية"); expect(text).toContain("الفرق بين");
        expect(text).not.toMatch(/الاسم الثلاثي|gmail|Google Forms/u);
        if (includeAnswers) expect(text).toContain("يتكون مثلث CIA"); else expect(text).not.toContain("يتكون مثلث CIA");
      } finally { await parser.destroy(); }
    }
  }, 30000);
});
