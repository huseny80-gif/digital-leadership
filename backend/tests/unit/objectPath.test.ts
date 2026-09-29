import { describe, expect, it } from "vitest";
import { buildObjectKey, sanitizeFilename } from "../../src/files/objectPath.js";

describe("sanitizeFilename", () => {
  it("6/7. strips path traversal and directory components", () => {
    expect(sanitizeFilename("../../../etc/passwd.pdf")).not.toMatch(/\.\.|\/|\\/);
    expect(sanitizeFilename("..\\..\\windows\\system32\\evil.pdf")).not.toMatch(/\.\.|\/|\\/);
  });

  it("6. strips control characters", () => {
    const withControlChars = "evil\x00\x1ffile.pdf";
    // eslint-disable-next-line no-control-regex -- asserting control chars were stripped
    expect(sanitizeFilename(withControlChars)).not.toMatch(/[\x00-\x1f]/);
  });

  it("6. replaces unsafe characters with underscores", () => {
    expect(sanitizeFilename("my file (final)!.pdf")).toBe("my_file__final__.pdf");
  });

  it("always ends with .pdf", () => {
    expect(sanitizeFilename("lecture-notes")).toBe("lecture-notes.pdf");
    expect(sanitizeFilename("lecture-notes.PDF")).toMatch(/\.pdf$/);
  });

  it("never produces a hidden-file-style leading dot", () => {
    expect(sanitizeFilename("..hidden.pdf").startsWith(".")).toBe(false);
  });
});

describe("buildObjectKey", () => {
  it("produces a deterministic, collision-resistant path with the fileId isolating each version", () => {
    const key = buildObjectKey({
      subjectId: "11111111-1111-4111-8111-111111111111",
      lectureId: "22222222-2222-4222-8222-222222222222",
      fileId: "33333333-3333-4333-8333-333333333333",
      safeFilename: "lecture1.pdf",
    });
    expect(key).toBe(
      "subjects/11111111-1111-4111-8111-111111111111/lectures/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/lecture1.pdf",
    );
  });

  it("uses 'unassigned' when no lecture is specified, never a client-controlled segment", () => {
    const key = buildObjectKey({
      subjectId: "11111111-1111-4111-8111-111111111111",
      lectureId: null,
      fileId: "33333333-3333-4333-8333-333333333333",
      safeFilename: "lecture1.pdf",
    });
    expect(key).toContain("/lectures/unassigned/");
  });
});
