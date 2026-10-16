import { describe, expect, it } from "vitest";
import { anonymousFeedbackSubmissionKey, decryptFeedback, encryptFeedback } from "../../src/feedback/privateContent.js";
const secret = "independent-test-only-secret-never-a-production-key";
describe("private feedback authenticated encryption", () => {
  it("deduplicates one anonymous submission without storing its principal or linking independent responses", () => {
    const principal = "user:private-user-id";
    const token = anonymousFeedbackSubmissionKey(principal, "retry-1", secret);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain("private-user-id");
    expect(anonymousFeedbackSubmissionKey(principal, "retry-1", secret)).toBe(token);
    expect(anonymousFeedbackSubmissionKey(principal, "retry-2", secret)).not.toBe(token);
    expect(anonymousFeedbackSubmissionKey("guest:private-user-id", "retry-1", secret)).not.toBe(token);
    expect(anonymousFeedbackSubmissionKey("user:another-user", "retry-1", secret)).not.toBe(token);
    expect(anonymousFeedbackSubmissionKey(principal, "retry-1", "different-secret")).not.toBe(token);
  });
  it("round-trips Arabic text and hides plaintext with a fresh nonce per value", () => {
    const text = "رأي خاص: لا يجوز الاطلاع عليه إلا للمخولين.";
    const one = encryptFeedback(text, "record-1", "message", secret), two = encryptFeedback(text, "record-1", "message", secret);
    expect(one).not.toBe(two); expect(one).not.toContain(text); expect(decryptFeedback(one, "record-1", "message", secret)).toBe(text);
  });
  it("binds ciphertext to its record, field and server key", () => {
    const ciphertext = encryptFeedback("ملاحظة سرية", "record-1", "internal_note", secret);
    for (const [id, field, key] of [["record-2", "internal_note", secret], ["record-1", "message", secret], ["record-1", "internal_note", "wrong-key"]] as const) expect(() => decryptFeedback(ciphertext, id, field, key)).toThrow("private_feedback_decryption_failed");
  });
  it("rejects tampered values and supports legitimately empty notes", () => {
    const ciphertext = encryptFeedback("", "record-1", "internal_note", secret);
    expect(decryptFeedback(ciphertext, "record-1", "internal_note", secret)).toBe("");
    expect(() => decryptFeedback(ciphertext.slice(0, -2) + "AA", "record-1", "internal_note", secret)).toThrow();
    expect(() => decryptFeedback("plaintext", "record-1", "message", secret)).toThrow();
  });
});
