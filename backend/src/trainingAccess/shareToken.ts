import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function storageKey(secret: string): Buffer {
  if (!secret) throw new Error("Training link storage requires a signing secret");
  return Buffer.from(hkdfSync("sha256", secret, "digital-leadership", "training-link-storage:v1", 32));
}

/** Authenticated encryption, bound to this grant. Raw links are never
 * stored as plaintext or included in grant/trainee list responses. */
export function encryptShareToken(token: string, secret: string, grantId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", storageKey(secret), nonce);
  cipher.setAAD(Buffer.from(`training-access:${grantId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptShareToken(value: string, secret: string, grantId: string): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid stored training link");
  const nonce = Buffer.from(parts[1]!, "base64url"), tag = Buffer.from(parts[3]!, "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("Invalid stored training link");
  const decipher = createDecipheriv("aes-256-gcm", storageKey(secret), nonce);
  decipher.setAAD(Buffer.from(`training-access:${grantId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64url")), decipher.final()]).toString("utf8");
}
