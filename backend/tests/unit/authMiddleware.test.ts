import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { UserProfile } from "@shared/index";
import { createAuthMiddleware } from "../../src/middleware/auth.js";
import type { UsersRepository } from "../../src/users/usersRepository.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";

/** In-memory fake — proves the middleware logic itself (extraction,
 * rejection, role checks) without any database, per
 * AUTHENTICATION_TEST_PLAN.md's "fully automatable locally" category. */
class FakeUsersRepository implements UsersRepository {
  private byIdentity = new Map<string, UserProfile>();

  seed(provider: string, providerSubject: string, profile: UserProfile) {
    this.byIdentity.set(`${provider}:${providerSubject}`, profile);
  }

  async findByIdentity(provider: string, providerSubject: string) {
    return this.byIdentity.get(`${provider}:${providerSubject}`) ?? null;
  }

  async findById(id: string) {
    return [...this.byIdentity.values()].find((u) => u.id === id) ?? null;
  }

  async createFromIdentity(input: {
    email: string;
    displayName: string;
    avatarUrl: string | null;
    provider: string;
    providerSubject: string;
  }): Promise<UserProfile> {
    const profile: UserProfile = {
      id: `generated-${this.byIdentity.size + 1}`,
      email: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      role: "user",
      status: "active",
      createdAt: new Date().toISOString(),
    };
    this.byIdentity.set(`${input.provider}:${input.providerSubject}`, profile);
    return profile;
  }
}

function mockReqRes(headers: Record<string, string> = {}) {
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe("authenticate", () => {
  it("calls next() without setting req.user when no Authorization header is present", async () => {
    const repo = new FakeUsersRepository();
    const { authenticate } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes();

    await authenticate(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("resolves and attaches the user for a valid token", async () => {
    const repo = new FakeUsersRepository();
    const { authenticate } = createAuthMiddleware(() => repo);
    const token = await signFakeSupabaseToken({ sub: "s1", email: "a@example.com" });
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });

    await authenticate(req, res, next);

    expect(req.user?.email).toBe("a@example.com");
    expect(req.user?.role).toBe("user");
    expect(next).toHaveBeenCalledWith();
  });

  it("passes an error to next() for an invalid token, rather than treating it as anonymous", async () => {
    const repo = new FakeUsersRepository();
    const { authenticate } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes({ authorization: "Bearer not-a-real-token" });

    await authenticate(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("requireAuthenticated", () => {
  it("rejects when req.user is not set", () => {
    const repo = new FakeUsersRepository();
    const { requireAuthenticated } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes();

    requireAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it("allows when req.user is set", () => {
    const repo = new FakeUsersRepository();
    const { requireAuthenticated } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes();
    req.user = { id: "1", email: "a@example.com", displayName: "A", avatarUrl: null, role: "user", status: "active", createdAt: "" };

    requireAuthenticated(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireRole / requireAdmin", () => {
  it("requireAdmin rejects a 'user'-role request with 403, not 401", () => {
    const repo = new FakeUsersRepository();
    const { requireAdmin } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes();
    req.user = { id: "1", email: "a@example.com", displayName: "A", avatarUrl: null, role: "user", status: "active", createdAt: "" };

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("requireAdmin allows an 'admin'-role request", () => {
    const repo = new FakeUsersRepository();
    const { requireAdmin } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes();
    req.user = { id: "1", email: "a@example.com", displayName: "A", avatarUrl: null, role: "admin", status: "active", createdAt: "" };

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("requireRole rejects an anonymous request with 401, not 403", () => {
    const repo = new FakeUsersRepository();
    const { requireRole } = createAuthMiddleware(() => repo);
    const { req, res, next } = mockReqRes();

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});
