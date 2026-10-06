import { describe, expect, it } from "vitest";
import { can } from "../../src/authorization/rbac.js";

describe("rbac.can", () => {
  it("grants admin full content management", () => {
    expect(can("admin", "content.manage")).toBe(true);
  });

  it("denies user role content management", () => {
    expect(can("user", "content.manage")).toBe(false);
  });

  it("grants user role quiz attempts", () => {
    expect(can("user", "quiz.attempt")).toBe(true);
  });

  it("denies an unknown role everything", () => {
    expect(can("observer", "content.view")).toBe(false);
  });

  it("limits the instructor to learner access and private feedback management", () => {
    expect(can("instructor", "content.view")).toBe(true);
    expect(can("instructor", "quiz.attempt")).toBe(true);
    expect(can("instructor", "feedback.manage")).toBe(true);
    for (const permission of ["user.manage", "quiz.manage", "content.manage", "file.upload"] as const) expect(can("instructor", permission)).toBe(false);
    expect(can("user", "feedback.manage")).toBe(false);
    expect(can("admin", "feedback.manage")).toBe(true);
  });
});
