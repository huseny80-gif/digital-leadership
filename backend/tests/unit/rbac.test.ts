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
    expect(can("instructor", "content.view")).toBe(false);
  });
});
