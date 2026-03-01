use base64::prelude::*;
use once_cell::sync::Lazy;
use ring::aead::{BoundKey, Nonce, UnboundKey, AES_256_GCM};
use ring::aead::{NonceSequence, OpeningKey, SealingKey};
use ring::rand::SecureRandom;
use std::sync::Mutex;

static ENCRYPTION_KEY: Lazy<Mutex<Option<Vec<u8>>>> = Lazy::new(|| Mutex::new(None));

const KEY_LENGTH: usize = 32; // 256 bits
const NONCE_LENGTH: usize = 12; // 96 bits for GCM
const TAG_LENGTH: usize = 16; // 128 bits for GCM

/// Generate a new random encryption key
#[allow(dead_code)]
pub fn generate_key() -> Vec<u8> {
    let mut key = vec![0u8; KEY_LENGTH];
    ring::rand::SystemRandom::new()
        .fill(&mut key)
        .expect("Failed to generate random key");
    key
}

/// Set the global encryption key (from passphrase or keychain)
pub fn set_key(key: Vec<u8>) -> Result<(), String> {
    if key.len() != KEY_LENGTH {
        return Err(format!(
            "Key must be {} bytes, got {}",
            KEY_LENGTH,
            key.len()
        ));
    }
    let mut global_key = ENCRYPTION_KEY.lock().map_err(|e| e.to_string())?;
    *global_key = Some(key);
    Ok(())
}

/// Get the current encryption key
fn get_key() -> Result<Vec<u8>, String> {
    let global_key = ENCRYPTION_KEY.lock().map_err(|e| e.to_string())?;
    global_key
        .clone()
        .ok_or_else(|| "Encryption key not set".to_string())
}

/// Derive a key from a passphrase using SHA-256
/// Note: In production with user passwords, use PBKDF2 or Argon2
pub fn derive_key_from_passphrase(passphrase: &str) -> Vec<u8> {
    use ring::digest::{Context, SHA256};
    let mut context = Context::new(&SHA256);
    context.update(passphrase.as_bytes());
    context.finish().as_ref().to_vec()
}

/// Encrypt plaintext using AES-256-GCM
/// Returns base64-encoded ciphertext with nonce prepended
/// Format: nonce (12 bytes) || ciphertext || tag (16 bytes)
pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key = get_key()?;

    // Generate random nonce
    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    ring::rand::SystemRandom::new()
        .fill(&mut nonce_bytes)
        .map_err(|_| "Failed to generate nonce")?;

    let unbound_key = UnboundKey::new(&AES_256_GCM, &key).map_err(|_| "Invalid key")?;

    // Create sealing key with one-time nonce
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut nonce_seq = OneTimeNonceSequence::new(nonce);
    let mut sealing_key = SealingKey::new(unbound_key, nonce_seq);

    // Prepare buffer: plaintext + space for tag
    let mut in_out = plaintext.as_bytes().to_vec();
    let plaintext_len = in_out.len();
    in_out.extend_from_slice(&[0u8; TAG_LENGTH]);

    // Encrypt in place and get tag
    // seal_in_place_separate_tag encrypts the data in place and returns the tag separately
    let tag = sealing_key
        .seal_in_place_separate_tag(ring::aead::Aad::empty(), &mut in_out[..plaintext_len])
        .map_err(|_| "Encryption failed")?;

    // Copy tag into the buffer after the ciphertext
    in_out[plaintext_len..plaintext_len + TAG_LENGTH].copy_from_slice(tag.as_ref());

    // Final format: nonce || ciphertext || tag
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&in_out);

    Ok(BASE64_STANDARD.encode(&result))
}

/// Decrypt base64-encoded ciphertext using AES-256-GCM
/// Expects format: nonce (12 bytes) || ciphertext || tag (16 bytes)
pub fn decrypt(ciphertext_b64: &str) -> Result<String, String> {
    let key = get_key()?;

    let ciphertext = BASE64_STANDARD
        .decode(ciphertext_b64)
        .map_err(|_| "Invalid base64 encoding")?;

    if ciphertext.len() < NONCE_LENGTH + TAG_LENGTH {
        return Err("Ciphertext too short".to_string());
    }

    // Split nonce and encrypted data (ciphertext + tag)
    let (nonce_bytes, encrypted) = ciphertext.split_at(NONCE_LENGTH);
    let nonce_bytes: [u8; NONCE_LENGTH] =
        nonce_bytes.try_into().map_err(|_| "Invalid nonce length")?;

    let unbound_key = UnboundKey::new(&AES_256_GCM, &key).map_err(|_| "Invalid key")?;

    // Create opening key with one-time nonce
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut nonce_seq = OneTimeNonceSequence::new(nonce);
    let mut opening_key = OpeningKey::new(unbound_key, nonce_seq);

    // Decrypt in place
    // open_in_place expects: ciphertext || tag
    // It verifies the tag and decrypts the ciphertext in place
    let mut in_out = encrypted.to_vec();
    let plaintext = opening_key
        .open_in_place(ring::aead::Aad::empty(), &mut in_out)
        .map_err(|_| "Decryption failed - wrong key or corrupted data")?;

    String::from_utf8(plaintext.to_vec()).map_err(|_| "Invalid UTF-8 in decrypted text".to_string())
}

/// Check if encryption key is set
pub fn is_key_set() -> bool {
    ENCRYPTION_KEY.lock().ok().and_then(|k| k.clone()).is_some()
}

/// Clear the encryption key from memory
pub fn clear_key() {
    if let Ok(mut key) = ENCRYPTION_KEY.lock() {
        *key = None;
    }
}

/// Initialize encryption with a passphrase
pub fn init_with_passphrase(passphrase: &str) -> Result<(), String> {
    let key = derive_key_from_passphrase(passphrase);
    set_key(key)
}

/// A one-time nonce sequence for use with a specific nonce
struct OneTimeNonceSequence {
    nonce: Option<Nonce>,
}

impl OneTimeNonceSequence {
    fn new(nonce: Nonce) -> Self {
        Self { nonce: Some(nonce) }
    }
}

impl NonceSequence for OneTimeNonceSequence {
    fn advance(&mut self) -> Result<Nonce, ring::error::Unspecified> {
        self.nonce.take().ok_or(ring::error::Unspecified)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = generate_key();
        set_key(key).unwrap();

        let plaintext = "Hello, World! This is sensitive data.";
        let encrypted = encrypt(plaintext).unwrap();
        println!("Encrypted: {}", encrypted);
        let decrypted = decrypt(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_different_nonces() {
        let key = generate_key();
        set_key(key).unwrap();

        let plaintext = "Same text";
        let encrypted1 = encrypt(plaintext).unwrap();
        let encrypted2 = encrypt(plaintext).unwrap();

        // Same plaintext should produce different ciphertexts due to random nonces
        assert_ne!(encrypted1, encrypted2);

        // But both should decrypt to the same plaintext
        assert_eq!(decrypt(&encrypted1).unwrap(), plaintext);
        assert_eq!(decrypt(&encrypted2).unwrap(), plaintext);
    }

    #[test]
    fn test_passphrase_derivation() {
        let key1 = derive_key_from_passphrase("my secret passphrase");
        let key2 = derive_key_from_passphrase("my secret passphrase");
        let key3 = derive_key_from_passphrase("different passphrase");

        // Same passphrase should derive same key
        assert_eq!(key1, key2);

        // Different passphrase should derive different key
        assert_ne!(key1, key3);
    }
}
