import { describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../src/lib/logger.js", () => ({ logger: { error: vi.fn() } }));
vi.mock("../../src/lib/monitoring.js", () => ({ captureException: vi.fn() }));
import { logger } from "../../src/lib/logger.js";
import { captureException } from "../../src/lib/monitoring.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

describe("private feedback error diagnostics", () => {
  it.each(["/api/v1/feedback", "/api/v1/feedback/manage/id"])("does not log submitted values from parser/database exceptions on %s", path => {
    vi.clearAllMocks();
    const err = Object.assign(new Error("private message from database"), { detail: "private internal note", body: "private submitted response" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(err, { path, method: "POST" } as Request, res as unknown as Response, vi.fn() as NextFunction);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("private");
    expect(vi.mocked(captureException).mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((vi.mocked(captureException).mock.calls[0]?.[0] as Error).message).toBe("Feedback request failed (internal_error)");
    expect(res.json).toHaveBeenCalledWith({ error: { code: "internal_error", message: "An unexpected error occurred." } });
  });
});
