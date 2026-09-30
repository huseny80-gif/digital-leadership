import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { GuestTrainingSession } from "@shared/index";

process.env.GUEST_SESSION_SIGNING_SECRET = "test-secret";

const { createGuestSessionMiddleware } = await import("../../src/trainingAccess/guestSessionMiddleware.js");
const { signGuestSessionCookieValue } = await import("../../src/trainingAccess/guestSessionCookie.js");
const { TrainingAccessService } = await import("../../src/trainingAccess/trainingAccessService.js");

function fakeSession(overrides: Partial<GuestTrainingSession> = {}): GuestTrainingSession {
  return {
    id: "session-1",
    displayName: "Guest",
    subjectId: "subject-1",
    subjectTitle: "Subject",
    status: "active",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

function mockReqRes(cookie?: string) {
  const req = { headers: { cookie }, guestSession: undefined } as unknown as Request;
  const res = { clearCookie: vi.fn() } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe("guest session middleware", () => {
  it("resolveGuestSession leaves req.guestSession unset when no cookie is present", async () => {
    const service = { resolveUsableSession: vi.fn() } as unknown as InstanceType<typeof TrainingAccessService>;
    const { resolveGuestSession } = createGuestSessionMiddleware(() => service);
    const { req, next } = mockReqRes(undefined);
    await resolveGuestSession(req, {} as Response, next);
    expect(req.guestSession).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
    expect(service.resolveUsableSession).not.toHaveBeenCalled();
  });

  it("resolveGuestSession leaves req.guestSession unset for a forged cookie (test case #13)", async () => {
    const service = { resolveUsableSession: vi.fn() } as unknown as InstanceType<typeof TrainingAccessService>;
    const { resolveGuestSession } = createGuestSessionMiddleware(() => service);
    const { req, next } = mockReqRes("training_guest_session=forged.notreal");
    await resolveGuestSession(req, {} as Response, next);
    expect(req.guestSession).toBeUndefined();
    // Forged signature is rejected before ever querying the database.
    expect(service.resolveUsableSession).not.toHaveBeenCalled();
  });

  it("resolveGuestSession attaches req.guestSession for a validly-signed, live session", async () => {
    const session = fakeSession();
    const service = { resolveUsableSession: vi.fn().mockResolvedValue(session) } as unknown as InstanceType<
      typeof TrainingAccessService
    >;
    const { resolveGuestSession } = createGuestSessionMiddleware(() => service);
    const cookieValue = signGuestSessionCookieValue(session.id);
    const { req, next } = mockReqRes(`training_guest_session=${encodeURIComponent(cookieValue)}`);
    await resolveGuestSession(req, {} as Response, next);
    expect(req.guestSession).toEqual(session);
    expect(service.resolveUsableSession).toHaveBeenCalledWith(session.id);
  });

  it("requireGuestSession rejects with 401 when no session was resolved (guest cannot access admin/other-user routes without a live session, test case #10)", () => {
    const service = {} as InstanceType<typeof TrainingAccessService>;
    const { requireGuestSession } = createGuestSessionMiddleware(() => service);
    const { req, res, next } = mockReqRes(undefined);
    requireGuestSession(req, res, next);
    expect(next).toHaveBeenCalled();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(err.status).toBe(401);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it("requireGuestSession passes through when req.guestSession is set", () => {
    const service = {} as InstanceType<typeof TrainingAccessService>;
    const { requireGuestSession } = createGuestSessionMiddleware(() => service);
    const { req, res, next } = mockReqRes(undefined);
    req.guestSession = fakeSession();
    requireGuestSession(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
