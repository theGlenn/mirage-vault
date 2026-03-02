import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveKey, encrypt, decrypt, decryptSafe } from "./crypto.js";

describe("deriveKey", () => {
  it("produces a 32-byte Buffer", () => {
    const key = deriveKey("test-passphrase");
    assert.equal(key.length, 32);
    assert.ok(Buffer.isBuffer(key));
  });

  it("produces consistent output for same passphrase", () => {
    const a = deriveKey("hello");
    const b = deriveKey("hello");
    assert.deepEqual(a, b);
  });

  it("produces different output for different passphrases", () => {
    const a = deriveKey("alpha");
    const b = deriveKey("beta");
    assert.notDeepEqual(a, b);
  });
});

describe("encrypt / decrypt round-trip", () => {
  const key = deriveKey("test-passphrase");

  it("decrypts back to original plaintext", () => {
    const plaintext = "Hello, Mirage Vault!";
    const ciphertext = encrypt(key, plaintext);
    const result = decrypt(key, ciphertext);
    assert.equal(result, plaintext);
  });

  it("handles empty string", () => {
    const ciphertext = encrypt(key, "");
    const result = decrypt(key, ciphertext);
    assert.equal(result, "");
  });

  it("handles unicode content", () => {
    const plaintext = "user@example.com 日本語 émojis 🔐";
    const ciphertext = encrypt(key, plaintext);
    const result = decrypt(key, ciphertext);
    assert.equal(result, plaintext);
  });

  it("produces valid base64 output", () => {
    const ciphertext = encrypt(key, "test");
    assert.doesNotThrow(() => Buffer.from(ciphertext, "base64"));
    // Minimum length: 12 (nonce) + 0 (empty plaintext min) + 16 (tag) = 28 bytes
    const decoded = Buffer.from(ciphertext, "base64");
    assert.ok(decoded.length >= 28);
  });

  it("produces different ciphertexts for same plaintext (random nonce)", () => {
    const a = encrypt(key, "same");
    const b = encrypt(key, "same");
    assert.notEqual(a, b);
  });
});

describe("decrypt error handling", () => {
  const key = deriveKey("test-passphrase");

  it("throws on ciphertext too short", () => {
    assert.throws(() => decrypt(key, Buffer.from("short").toString("base64")), {
      message: "Ciphertext too short",
    });
  });

  it("throws on wrong key", () => {
    const wrongKey = deriveKey("wrong-passphrase");
    const ciphertext = encrypt(key, "secret");
    assert.throws(() => decrypt(wrongKey, ciphertext));
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt(key, "secret");
    const data = Buffer.from(ciphertext, "base64");
    data[15] ^= 0xff; // flip a byte in the encrypted portion
    const tampered = data.toString("base64");
    assert.throws(() => decrypt(key, tampered));
  });
});

describe("decryptSafe", () => {
  const key = deriveKey("test-passphrase");

  it("decrypts valid ciphertext", () => {
    const ciphertext = encrypt(key, "safe content");
    assert.equal(decryptSafe(key, ciphertext), "safe content");
  });

  it("returns raw string on invalid input", () => {
    assert.equal(decryptSafe(key, "not-encrypted"), "not-encrypted");
  });

  it("returns raw string on wrong key", () => {
    const wrongKey = deriveKey("wrong");
    const ciphertext = encrypt(key, "secret");
    assert.equal(decryptSafe(wrongKey, ciphertext), ciphertext);
  });

  it("returns raw string for plain text content", () => {
    const plainText = "This is pre-encryption data";
    assert.equal(decryptSafe(key, plainText), plainText);
  });
});
