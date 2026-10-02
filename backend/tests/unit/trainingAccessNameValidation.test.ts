import { describe, expect, it } from "vitest";
import { validateTraineeName } from "../../src/trainingAccess/nameValidation.js";
import { ValidationError } from "../../src/lib/validation.js";

describe("validateTraineeName", () => {
  it("rejects an empty name (test case #5)", () => {
    expect(() => validateTraineeName("")).toThrow(ValidationError);
  });

  it("rejects a whitespace-only name", () => {
    expect(() => validateTraineeName("   ")).toThrow(ValidationError);
  });

  it("rejects a non-string value", () => {
    expect(() => validateTraineeName(undefined)).toThrow(ValidationError);
    expect(() => validateTraineeName(123)).toThrow(ValidationError);
    expect(() => validateTraineeName(null)).toThrow(ValidationError);
  });

  it("accepts a valid Arabic three-part name (test case #7)", () => {
    expect(validateTraineeName("أحمد محمد العلي")).toBe("أحمد محمد العلي");
  });

  it("accepts a valid Latin-script name", () => {
    expect(validateTraineeName("  Jane   Q. Doe  ")).toBe("Jane Q. Doe");
  });

  it("rejects an HTML/script injection attempt (test case #6)", () => {
    expect(() => validateTraineeName("<script>alert(1)</script>")).toThrow(ValidationError);
  });

  it("rejects an injection attempt disguised with surrounding valid text", () => {
    expect(() => validateTraineeName("Ahmad <img src=x onerror=alert(1)>")).toThrow(ValidationError);
  });

  it("rejects control characters", () => {
    expect(() => validateTraineeName("Ahmad\u0000Ali")).toThrow(ValidationError);
  });

  it("rejects a name that is too long", () => {
    expect(() => validateTraineeName("a".repeat(200))).toThrow(ValidationError);
  });

  it("rejects a name that is too short after trimming", () => {
    expect(() => validateTraineeName(" a ")).toThrow(ValidationError);
  });

  it("collapses internal whitespace runs", () => {
    expect(validateTraineeName("Ahmad     Ali    Hassan")).toBe("Ahmad Ali Hassan");
  });
});
