import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { transportSecurity, validateInputEnvelope } from "../../src/middleware/security.js";

function response() {
  const res = { set: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res); return res;
}
describe("transport and request security", () => {
  it("rejects plaintext production requests before routing without redirecting a sensitive body", () => {
    const res = response(), next = vi.fn();
    transportSecurity(true)({ secure: false, path: "/api/v1/admin/users" } as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(426); expect(next).not.toHaveBeenCalled();
  });
  it("allows TLS and emits HSTS and safe rendering headers", () => {
    const res = response(), next = vi.fn();
    transportSecurity(true)({ secure: true, path: "/api/v1/subjects" } as Request, res as unknown as Response, next);
    expect(res.set).toHaveBeenCalledWith("Strict-Transport-Security", expect.stringContaining("max-age="));
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ "X-Content-Type-Options": "nosniff" })); expect(next).toHaveBeenCalledWith();
  });
  it("keeps the minimal internal health probe and local development reachable", () => {
    for (const [production, path] of [[true, "/health"], [false, "/api/v1/subjects"]] as const) {
      const next = vi.fn(); transportSecurity(production)({ secure: false, path } as Request, response() as unknown as Response, next); expect(next).toHaveBeenCalledWith();
    }
  });
  it("rejects nested pollution keys and NUL input", () => {
    for (const body of [JSON.parse('{"nested":{"__proto__":{"role":"admin"}}}'), { message: "nul\u0000text" }, { constructor: "admin" }]) {
      const next = vi.fn(); validateInputEnvelope({ body, query: {} } as Request, response() as unknown as Response, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    }
  });
  it("rejects excessive nesting but keeps ordinary Arabic/source text intact", () => {
    let nested: object = {}; for (let i = 0; i < 42; i++) nested = { nested };
    const next = vi.fn(); validateInputEnvelope({ body: nested, query: {} } as Request, response() as unknown as Response, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    const body = { text: "الشرط: لا يجوز حذف الرقم ٢. <script>مثال نصي</script>" }, safe = vi.fn();
    validateInputEnvelope({ body, query: { q: "' OR 1=1 --" } } as unknown as Request, response() as unknown as Response, safe); expect(safe).toHaveBeenCalledWith(); expect(body.text).toContain("لا يجوز");
  });
});
