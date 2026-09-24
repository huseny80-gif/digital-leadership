import { describe, expect, it } from "vitest";
import { rubricSchema } from "../../src/admin/rubricValidation.js";

describe("rubricSchema", () => {
  it("accepts null", () => {
    expect(rubricSchema.safeParse(null).success).toBe(true);
  });

  it("accepts the exact Finquiz rubric shape", () => {
    const result = rubricSchema.safeParse([
      { text: "تشخيص الخطأ", keywords: ["غموض", "السياق"] },
      { text: "القاعدة الأولى", keywords: [] },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a rubric item missing 'text'", () => {
    expect(rubricSchema.safeParse([{ keywords: ["a"] }]).success).toBe(false);
  });

  it("rejects a rubric item with empty 'text'", () => {
    expect(rubricSchema.safeParse([{ text: "", keywords: [] }]).success).toBe(false);
  });

  it("rejects a rubric item whose 'keywords' is not an array", () => {
    expect(rubricSchema.safeParse([{ text: "x", keywords: "not-an-array" }]).success).toBe(false);
  });

  it("rejects a bare object instead of an array", () => {
    expect(rubricSchema.safeParse({ text: "x", keywords: [] }).success).toBe(false);
  });

  it("accepts an empty array", () => {
    expect(rubricSchema.safeParse([]).success).toBe(true);
  });
});
