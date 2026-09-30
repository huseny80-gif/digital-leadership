import { describe, expect, it, beforeEach } from "vitest";

process.env.GUEST_SESSION_SIGNING_SECRET = "test-secret-for-guest-session-cookie-signing";

const { signGuestSessionCookieValue, verifyGuestSessionCookieValue, readGuestSessionCookie } = await import(
  "../../src/trainingAccess/guestSessionCookie.js"
);

describe("guest session cookie signing", () => {
  it("verifies a value it signed, returning the original session id", () => {
    const sessionId = "11111111-1111-1111-1111-111111111111";
    const signed = signGuestSessionCookieValue(sessionId);
    expect(verifyGuestSessionCookieValue(signed)).toBe(sessionId);
  });

  it("rejects a value with a tampered session id (forged session, test case #13)", () => {
    const signed = signGuestSessionCookieValue("11111111-1111-1111-1111-111111111111");
    const dot = signed.lastIndexOf(".");
    const forged = "22222222-2222-2222-2222-222222222222" + signed.slice(dot);
    expect(verifyGuestSessionCookieValue(forged)).toBeNull();
  });

  it("rejects a value with a tampered signature", () => {
    const signed = signGuestSessionCookieValue("11111111-1111-1111-1111-111111111111");
    const tampered = signed.slice(0, -2) + "00";
    expect(verifyGuestSessionCookieValue(tampered)).toBeNull();
  });

  it("rejects a malformed value with no signature separator", () => {
    expect(verifyGuestSessionCookieValue("not-a-signed-value")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(verifyGuestSessionCookieValue("")).toBeNull();
  });

  describe("readGuestSessionCookie", () => {
    function reqWith(cookieHeader: string | undefined) {
      return { headers: { cookie: cookieHeader } } as unknown as Parameters<typeof readGuestSessionCookie>[0];
    }

    it("returns null when no cookie header is present", () => {
      expect(readGuestSessionCookie(reqWith(undefined))).toBeNull();
    });

    it("extracts the named cookie among several", () => {
      const req = reqWith("other=1; training_guest_session=abc.def; another=2");
      expect(readGuestSessionCookie(req)).toBe("abc.def");
    });

    it("returns null when the named cookie is absent", () => {
      const req = reqWith("other=1; another=2");
      expect(readGuestSessionCookie(req)).toBeNull();
    });
  });
});
