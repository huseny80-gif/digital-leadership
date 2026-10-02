import { ValidationError } from "../lib/validation.js";

/**
 * Server-side validation for a guest trainee's display name ("الاسم
 * الثلاثي" — full/three-part name). This is the ONLY place this value is
 * validated that matters: the join page's client-side check is a UX
 * convenience, never trusted (task requirement: "Do this validation in
 * the backend endpoint, not just the client").
 *
 * The name is treated as opaque plain text end-to-end: never rendered as
 * HTML anywhere (React/JSX escapes it by default on the web side, and
 * this function never needs to strip HTML for *safety* — no server-side
 * template ever concatenates it into markup) — the only reason we still
 * reject control/script-like input here is defense in depth against a
 * future consumer (CSV export, a plain-text log, a non-React renderer)
 * treating it less carefully than JSX does.
 */

const MIN_LENGTH = 2;
const MAX_LENGTH = 120;

// Rejects raw HTML/script-like input outright rather than trying to
// strip it — stripping is a common source of bypass bugs (e.g. nested
// tags), and a real full name never legitimately contains `<`, `>`, `&`,
// backticks, or control characters.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>&`\u0000-\u001f\u007f]/;

/** Letters (any script, including Arabic), spaces, and a small set of
 * name-safe punctuation (hyphen, apostrophe, period for initials). */
const ALLOWED_NAME_PATTERN = /^[\p{L}\p{M}\s.'-]+$/u;

export function validateTraineeName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ValidationError("Name is required.");
  }
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    throw new ValidationError("Name is required.");
  }
  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) {
    throw new ValidationError(`Name must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters.`);
  }
  if (FORBIDDEN_CHARS.test(trimmed)) {
    throw new ValidationError("Name contains characters that are not allowed.");
  }
  if (!ALLOWED_NAME_PATTERN.test(trimmed)) {
    throw new ValidationError("Name must contain only letters, spaces, and name punctuation.");
  }
  return trimmed;
}
