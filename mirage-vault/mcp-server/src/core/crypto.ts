import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

/**
 * Derive a 32-byte AES-256 key from a passphrase using SHA-256.
 * Matches the Rust backend's `derive_key_from_passphrase`.
 */
export function deriveKey(passphrase: string): Buffer {
  return createHash("sha256").update(passphrase).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Output format: base64(nonce[12] || ciphertext || tag[16])
 * Matches the Rust backend's `crypto::encrypt`.
 */
export function encrypt(key: Buffer, plaintext: string): string {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, encrypted, tag]).toString("base64");
}

/**
 * Decrypt ciphertext produced by the Rust backend's AES-256-GCM format.
 * Input: base64(nonce[12] || ciphertext || tag[16])
 */
export function decrypt(key: Buffer, ciphertext: string): string {
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new Error("Ciphertext too short");
  }

  const nonce = data.subarray(0, NONCE_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const encrypted = data.subarray(NONCE_LENGTH, data.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Decrypt with fallback: returns the raw string if decryption fails.
 * Matches the Rust backend's `decrypt().unwrap_or_else(|_| raw)` pattern.
 */
export function decryptSafe(key: Buffer, ciphertext: string): string {
  try {
    return decrypt(key, ciphertext);
  } catch {
    return ciphertext;
  }
}
