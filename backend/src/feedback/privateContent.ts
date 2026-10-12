import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "../config/env.js";

type Field = "message" | "internal_note" | "submitted_name";
const key = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "digital-leadership", "private-feedback-content:v1", 32));
export function encryptFeedback(value: string, id: string, field: Field, secret = getEnv().GUEST_SESSION_SIGNING_SECRET): string {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), nonce);
  cipher.setAAD(Buffer.from(`participant-feedback:${id}:${field}`));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), data.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}
export function decryptFeedback(value: string, id: string, field: Field, secret = getEnv().GUEST_SESSION_SIGNING_SECRET): string {
  try {
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some(part => !/^[A-Za-z0-9_-]*$/u.test(part))) throw new Error();
    const nonce = Buffer.from(parts[1]!, "base64url"), tag = Buffer.from(parts[3]!, "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(secret), nonce);
    decipher.setAAD(Buffer.from(`participant-feedback:${id}:${field}`)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("private_feedback_decryption_failed"); }
}
