import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.API_BASE_URL = "http://backend.test";

import { GET as joinGet, POST as joinPost } from "@/app/api/guest-join/[token]/route";
import { GET as guestGet } from "@/app/api/guest/[...path]/route";

function ctxToken(token: string) {
  return { params: Promise.resolve({ token }) };
}
function ctxPath(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("guest-join proxy (/api/guest-join/[token])", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET forwards to the backend's public join-info endpoint with no auth header", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { subjectTitle: "Leadership 101", subjectDescription: null } }), { status: 200 }),
    );
    const res = await joinGet(new Request("http://test/api/guest-join/abc"), ctxToken("abc"));
    expect(fetchMock).toHaveBeenCalledWith("http://backend.test/api/v1/training-access/join/abc", expect.anything());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subjectTitle).toBe("Leadership 101");
  });

  it("GET propagates a 404 from the backend for an invalid token, without leaking distinguishing detail", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found", message: "Training access link not found." } }), { status: 404 }),
    );
    const res = await joinGet(new Request("http://test/api/guest-join/bogus"), ctxToken("bogus"));
    expect(res.status).toBe(404);
  });

  it("POST forwards the trainee name and relays the backend's Set-Cookie header onto the same-origin response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "session-1", displayName: "Ahmad Ali" } }), {
        status: 201,
        headers: { "set-cookie": "training_guest_session=abc.def; HttpOnly; Path=/" },
      }),
    );
    const res = await joinPost(
      new Request("http://test/api/guest-join/abc", { method: "POST", body: JSON.stringify({ name: "Ahmad Ali" }) }),
      ctxToken("abc"),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain("training_guest_session=abc.def");
  });

  it("POST rejects an invalid JSON body with 400 before ever calling the backend", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await joinPost(new Request("http://test/api/guest-join/abc", { method: "POST", body: "{not json" }), ctxToken("abc"));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("guest content/progress proxy (/api/guest/[...path])", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET forwards the browser's Cookie header to the backend (never a bearer token)", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: { id: "session-1" } }), { status: 200 }));
    const req = new Request("http://test/api/guest/me", { headers: { cookie: "training_guest_session=abc.def" } });
    await guestGet(req, ctxPath(["me"]));
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ cookie: "training_guest_session=abc.def" });
  });

  it("GET forwards to the versioned backend guest path, including the sub-path", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await guestGet(new Request("http://test/api/guest/subjects/s1/lectures"), ctxPath(["subjects", "s1", "lectures"]));
    expect(fetchMock).toHaveBeenCalledWith("http://backend.test/api/v1/guest/subjects/s1/lectures", expect.anything());
  });

  it("returns the backend's 401 unchanged when the guest session cookie is missing/invalid", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthenticated", message: "Authentication is required." } }), { status: 401 }),
    );
    const res = await guestGet(new Request("http://test/api/guest/me"), ctxPath(["me"]));
    expect(res.status).toBe(401);
  });

  it("PUT forwards a JSON body for lecture progress", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: { lectureId: "l1", completed: true, completedAt: null } }), { status: 200 }));
    const { PUT: guestPut } = await import("@/app/api/guest/[...path]/route");
    await guestPut(
      new Request("http://test/api/guest/lectures/l1/progress", { method: "PUT", body: JSON.stringify({ completed: true }) }),
      ctxPath(["lectures", "l1", "progress"]),
    );
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).body).toBe(JSON.stringify({ completed: true }));
  });
});
