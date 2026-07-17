import crypto from "crypto";

/**
 * Generates a random token for email verification / password reset links.
 * Only the SHA-256 hash is persisted; the raw value is emailed to the user
 * and never stored, so a database read alone can't be used to forge a link.
 */
export function generateToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "")).digest("hex");
}
