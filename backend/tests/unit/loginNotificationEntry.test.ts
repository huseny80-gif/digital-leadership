import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { GuestTrainingSession, UserProfile } from "@shared/index";
import type { Request } from "express";
import { learningRoutes } from "../../src/learning/learningRoutes.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { loginNotificationsRoutes } from "../../src/notifications/loginNotificationsRoutes.js";
import { createGuestSessionMiddleware } from "../../src/trainingAccess/guestSessionMiddleware.js";
import { signGuestSessionCookieValue } from "../../src/trainingAccess/guestSessionCookie.js";
import type { TrainingAccessService } from "../../src/trainingAccess/trainingAccessService.js";

const user: UserProfile = {
  id: "ec5562e4-911a-4b83-883c-a9b4ee4c4a9e", email: "private@example.test",
  displayName: "المتدرب الحقيقي", avatarUrl: null, role: "user", status: "active", createdAt: "2026-11-08T12:00:00Z",
};
const guest: GuestTrainingSession = {
  id: "b0720a83-e2dd-46ba-b47f-4d2f495bd8f0", displayName: "الزائر الحقيقي", status: "active",
  createdAt: "2026-11-08T12:00:00Z", lastSeenAt: "2026-11-08T12:00:00Z", expiresAt: null,
};

function learnerApp(context: Partial<Pick<Request, "user" | "guestSession" | "authSession">> = {}) {
  const repository = { recordEntry: vi.fn().mockResolvedValue(true) };
  const getStore = vi.fn(() => repository);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, context); next(); });
  app.use(learningRoutes(getStore));
  app.use(errorHandler);
  return { app, repository, getStore };
}

describe("learning entry endpoint", () => {
  it("records only the verified learner/session, never a client identity", async () => {
    const repository = { recordEntry: vi.fn().mockResolvedValue(true) };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = user;
      req.authSession = { userId: user.id, fingerprint: "a".repeat(64) };
      next();
    });
    app.use(learningRoutes(() => repository));
    app.use(errorHandler);
    const response = await request(app).post("/learning/entry").send({});
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { recorded: true } });
    expect(repository.recordEntry).toHaveBeenCalledWith({ kind: "trainee", principalId: user.id, fingerprint: "a".repeat(64) });
  });

  it.each([
    { userId: "another-user" }, { guestSessionId: guest.id }, { session_id: "forged" },
    { displayName: "اسم مزيف" }, { role: "admin" }, { fingerprint: "forged" },
  ])("rejects extra client identity/name/session fields %j", async (body) => {
    const { app, repository } = learnerApp({ user, authSession: { userId: user.id, fingerprint: "a".repeat(64) } });
    expect((await request(app).post("/learning/entry").send(body)).status).toBe(400);
    expect(repository.recordEntry).not.toHaveBeenCalled();
  });

  it("ignores forged query/header identities and binds to the verified user", async () => {
    const { app, repository } = learnerApp({ user, authSession: { userId: user.id, fingerprint: "a".repeat(64) } });
    expect((await request(app).post(`/learning/entry?userId=${guest.id}&displayName=Fake`)
      .set("x-user-id", guest.id).set("x-session-id", "forged").send({})).status).toBe(200);
    expect(repository.recordEntry).toHaveBeenCalledWith({ kind: "trainee", principalId: user.id, fingerprint: "a".repeat(64) });
  });

  it.each(["admin", "instructor", "future-staff-role"])("ignores staff role %s without opening the pool", async (role) => {
    const { app, getStore } = learnerApp({ user: { ...user, role }, authSession: { userId: user.id, fingerprint: "a".repeat(64) } });
    const response = await request(app).post("/learning/entry").send({});
    expect(response.body).toEqual({ data: { recorded: false } });
    expect(getStore).not.toHaveBeenCalled();
  });

  it.each([undefined, { userId: guest.id, fingerprint: "a".repeat(64) }])(
    "omits registered events without source-bound stable session context %j", async (authSession) => {
      const { app, getStore } = learnerApp({ user, ...(authSession ? { authSession } : {}) });
      expect((await request(app).post("/learning/entry").send({})).body).toEqual({ data: { recorded: false } });
      expect(getStore).not.toHaveBeenCalled();
    },
  );

  it("does not fall back to a guest identity when a staff user also has a guest cookie", async () => {
    const { app, getStore } = learnerApp({ user: { ...user, role: "admin" }, guestSession: guest });
    expect((await request(app).post("/learning/entry").send({})).body).toEqual({ data: { recorded: false } });
    expect(getStore).not.toHaveBeenCalled();
  });

  it("rejects anonymous and inactive learners without creating an event", async () => {
    for (const [context, status] of [[{}, 401], [{ user: { ...user, status: "suspended" as const } }, 403],
      [{ guestSession: { ...guest, status: "revoked" as const } }, 403],
      [{ guestSession: { ...guest, expiresAt: "2000-01-01T00:00:00Z" } }, 403]] as const) {
      const { app, repository } = learnerApp(context);
      expect((await request(app).post("/learning/entry").send({})).status).toBe(status);
      expect(repository.recordEntry).not.toHaveBeenCalled();
    }
  });

  it("records the guest's own verified cookie session and safely retries its resume", async () => {
    const repository = { recordEntry: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false) };
    const service = { resolveUsableSession: vi.fn().mockImplementation(async (id: string) => id === guest.id ? guest : null) };
    const app = express();
    app.use(express.json());
    app.use(createGuestSessionMiddleware(() => service as unknown as TrainingAccessService).resolveGuestSession);
    app.use(learningRoutes(() => repository));
    app.use(errorHandler);
    const cookie = `training_guest_session=${signGuestSessionCookieValue(guest.id)}`;
    expect((await request(app).post("/learning/entry").set("Cookie", cookie).send({})).body).toEqual({ data: { recorded: true } });
    expect((await request(app).post("/learning/entry").set("Cookie", cookie).send({})).body).toEqual({ data: { recorded: false } });
    expect(repository.recordEntry).toHaveBeenNthCalledWith(1, {
      kind: "visitor", principalId: guest.id, fingerprint: createHash("sha256").update(`guest:${guest.id}`).digest("hex"),
    });
    expect(repository.recordEntry.mock.calls[1]).toEqual(repository.recordEntry.mock.calls[0]);
    repository.recordEntry.mockClear();
    service.resolveUsableSession.mockClear();
    const forged = `training_guest_session=${guest.id}.forged`;
    expect((await request(app).post("/learning/entry").set("Cookie", forged).send({})).status).toBe(401);
    expect(service.resolveUsableSession).not.toHaveBeenCalled();
    expect(repository.recordEntry).not.toHaveBeenCalled();
  });
});

describe("admin login notification routes", () => {
  function adminApp(profile?: UserProfile, guestSession?: GuestTrainingSession) {
    const repository = {
      feed: vi.fn().mockResolvedValue({ items: [], unreadCount: 0, latestId: null }),
      acknowledge: vi.fn().mockResolvedValue(undefined),
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (profile) req.user = profile;
      if (guestSession) req.guestSession = guestSession;
      next();
    });
    app.use("/admin/login-notifications", loginNotificationsRoutes(() => repository));
    app.use(errorHandler);
    return { app, repository };
  }

  it("requires an active admin when mounted alone, for both feed and read acknowledgement", async () => {
    for (const [profile, guestSession, status] of [[undefined, undefined, 401], [user, undefined, 403],
      [{ ...user, role: "instructor" }, undefined, 403], [undefined, guest, 401],
      [{ ...user, role: "admin", status: "suspended" as const }, undefined, 403]] as const) {
      const { app, repository } = adminApp(profile, guestSession);
      expect((await request(app).get("/admin/login-notifications")).status).toBe(status);
      expect((await request(app).post("/admin/login-notifications/read").send({ throughId: guest.id })).status).toBe(status);
      expect(repository.feed).not.toHaveBeenCalled();
      expect(repository.acknowledge).not.toHaveBeenCalled();
    }
  });

  it("serves an uncached feed and binds read acknowledgement to the authenticated admin", async () => {
    const admin = { ...user, role: "admin" };
    const { app, repository } = adminApp(admin);
    const response = await request(app).get("/admin/login-notifications?adminUserId=forged");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(repository.feed).toHaveBeenCalledWith(admin.id);
    const read = await request(app).post("/admin/login-notifications/read").send({ throughId: guest.id });
    expect(read.body).toEqual({ data: { recorded: true } });
    expect(repository.acknowledge).toHaveBeenCalledWith(admin.id, guest.id);
  });

  it.each([{}, { throughId: "invalid" }, { throughId: guest.id, adminUserId: user.id },
    { throughId: guest.id, createdAt: "2099-01-01" }, { throughId: null }])("strictly rejects malformed/forged cursors %j", async (body) => {
    const { app, repository } = adminApp({ ...user, role: "admin" });
    expect((await request(app).post("/admin/login-notifications/read").send(body)).status).toBe(400);
    expect(repository.acknowledge).not.toHaveBeenCalled();
  });
});
