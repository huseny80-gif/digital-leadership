import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("protected routes", () => {
  it("rejects an unauthenticated request to a protected route (SECURITY_ARCHITECTURE.md §14)", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/subjects");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("rejects an unauthenticated request to an admin route", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.status).toBe(401);
  });
});
