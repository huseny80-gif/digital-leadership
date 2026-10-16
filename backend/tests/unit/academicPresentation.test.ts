import { describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { academicPresentation } from "../../src/middleware/academicPresentation.js";

describe("academic-only response spelling boundary", () => {
  it("proofreads successful course JSON after domain decisions", () => {
    const send = vi.fn(), set = vi.fn();
    const res = { statusCode: 200, json: send, set };
    academicPresentation({ path: "/subjects/course/library" } as Request, res as unknown as Response, vi.fn() as NextFunction);
    res.json({ data: { title: "األمن", id: "immutable", sourceReferences: [{ sha256: "immutable", excerpt: "األول" }] } });
    expect(send).toHaveBeenCalledWith({ data: { title: "الأمن", id: "immutable", sourceReferences: [{ sha256: "immutable", excerpt: "الأول" }] } });
  });
  it.each(["/feedback", "/feedback/manage", "/users", "/auth/login", "/admin/users"])("leaves private/nonacademic route %s untouched", path => {
    const send = vi.fn(), res = { statusCode: 200, json: send };
    academicPresentation({ path } as Request, res as unknown as Response, vi.fn() as NextFunction);
    expect(res.json).toBe(send);
  });
  it("leaves denial/error responses and their status unchanged", () => {
    const send = vi.fn(), set = vi.fn(), res = { statusCode: 403, json: send, set };
    academicPresentation({ path: "/subjects/course/library" } as Request, res as unknown as Response, vi.fn() as NextFunction);
    const body = { error: { code: "forbidden", message: "األمن" } }; res.json(body);
    expect(send).toHaveBeenCalledWith(body); expect(set).not.toHaveBeenCalled(); expect(res.statusCode).toBe(403);
  });
});
