// zariia-crypto.mjs
//
// The sealed channel's confidentiality layer. Nothing here hides that a sealed
// channel is present — that presence is open by design (see docs/concept/zariia.md,
// "Honest boundaries"; CLAUDE.md ). What is protected is the *content*,
// and only that. This module encrypts and decrypts the payload; it makes no claim
// about anonymity, undetectability, or evasion.
//
// AEAD: AES-256-GCM via Web Crypto (SubtleCrypto). The exact same code runs in Node
// (>=20, where globalThis.crypto.subtle exists) and in a browser, so the packer and
// the player share one implementation.
//
// Property trace (CLAUDE.md — what happens on failure):
//   - Wrong key / tampered ciphertext: GCM's 128-bit auth tag fails verification and
//     SubtleCrypto.decrypt() THROWS. There is no silent fallthrough to garbage
//     plaintext. `unseal()` propagates the throw; the caller gets nothing, not a
//     corrupted second channel. Test: tests/roundtrip.mjs flips one ciphertext byte
//     and asserts unseal() rejects.
//   - The confidentiality claim is therefore real, and it is the ONLY security claim
//     this file is entitled to make. It rests entirely on the secrecy of the key and
//     who holds it (zariia.md: "the content is only ever as safe as the key and who
//     holds it"). Nothing here strengthens a weak key beyond the KDF below.

const subtle = globalThis.crypto?.subtle;
if (!subtle) {
  throw new Error(
    'Web Crypto (crypto.subtle) is unavailable. Node >= 20 or a browser secure context is required.'
  );
}

export const KEYMODE = { RAW: 0, PASSPHRASE_PBKDF2: 1 };

// PBKDF2 iteration count. This is deliberately conservative for a browser player.
// NOTE : PBKDF2 only *slows* an offline attack on a
// low-entropy passphrase; it does not stop one. The ciphertext of a Zariia drop is
// public (the sealed channel is openly present in the file), so a spoken/weak
// passphrase is directly exposed to offline guessing. The strong default is RAW mode
// with a full 256-bit key passed hand-to-hand (a string or QR), which removes the
// offline-guessing surface entirely. Passphrase mode exists for convenience and is
// documented as the weaker option, not the default.
const PBKDF2_ITERS = 600_000;

const enc = new TextEncoder();

/** Import a raw 32-byte key as an AES-256-GCM key. */
async function importRawKey(raw32) {
  if (raw32.byteLength !== 32) throw new Error('Raw key must be exactly 32 bytes (256 bits).');
  return subtle.importKey('raw', raw32, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Derive a 256-bit AES key from a passphrase via PBKDF2-HMAC-SHA-256. */
async function deriveKey(passphrase, salt16) {
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt16, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Generate a fresh 256-bit key. Returned as Uint8Array — this IS the shareable key. */
export function generateKey() {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encrypt `plaintext` (Uint8Array) into a self-describing sealed blob.
 * @param {Uint8Array} plaintext
 * @param {{mode:number, rawKey?:Uint8Array, passphrase?:string}} keySpec
 * @returns {Promise<Uint8Array>} header || ciphertext(+tag)
 *
 * Blob layout (all fixed-width fields, big-endian where numeric):
 *   [0..3]   magic "ZRK1"
 *   [4]      version = 1
 *   [5]      keymode (KEYMODE.*)
 *   [6..21]  salt (16 bytes; zero-filled in RAW mode)
 *   [22..33] iv/nonce (12 bytes, random per seal)
 *   [34..]   AES-GCM ciphertext with 16-byte tag appended (SubtleCrypto convention)
 */
export async function seal(plaintext, keySpec, aad) {
  const salt = new Uint8Array(16);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  let key;
  if (keySpec.mode === KEYMODE.RAW) {
    key = await importRawKey(keySpec.rawKey);
  } else if (keySpec.mode === KEYMODE.PASSPHRASE_PBKDF2) {
    globalThis.crypto.getRandomValues(salt);
    key = await deriveKey(keySpec.passphrase, salt);
  } else {
    throw new Error(`Unknown key mode: ${keySpec.mode}`);
  }

  // AAD binds the sealed channel to the open track (see zariia-flac audioDigest).
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  const ct = new Uint8Array(await subtle.encrypt(params, key, plaintext));

  const header = new Uint8Array(34);
  header.set(enc.encode('ZRK1'), 0);
  header[4] = aad ? 2 : 1;   // v2 = bound to the open track
  header[5] = keySpec.mode;
  header.set(salt, 6);
  header.set(iv, 22);

  const out = new Uint8Array(header.length + ct.length);
  out.set(header, 0);
  out.set(ct, header.length);
  return out;
}

/**
 * Decrypt a sealed blob. Throws on any mismatch (bad magic, wrong key, tamper).
 * @param {Uint8Array} blob
 * @param {{mode?:number, rawKey?:Uint8Array, passphrase?:string}} keySpec
 * @returns {Promise<Uint8Array>} plaintext
 */
export async function unseal(blob, keySpec, aad) {
  if (blob.length < 34) throw new Error('Sealed blob too short.');
  const magic = new TextDecoder().decode(blob.subarray(0, 4));
  if (magic !== 'ZRK1') throw new Error(`Bad sealed-blob magic: ${magic}`);
  const version = blob[4];
  if (version !== 1 && version !== 2) throw new Error(`Unsupported sealed-blob version: ${version}`);
  // v1 predates track-binding and carries no AAD; v2 requires it. Passing AAD to a v1 blob
  // (or omitting it for a v2 blob) makes the tag fail, which is the correct outcome.
  const mode = blob[5];
  const salt = blob.subarray(6, 22);
  const iv = blob.subarray(22, 34);
  const ct = blob.subarray(34);

  let key;
  if (mode === KEYMODE.RAW) {
    if (!keySpec.rawKey) throw new Error('This blob needs a raw key.');
    key = await importRawKey(keySpec.rawKey);
  } else if (mode === KEYMODE.PASSPHRASE_PBKDF2) {
    if (!keySpec.passphrase) throw new Error('This blob needs a passphrase.');
    key = await deriveKey(keySpec.passphrase, salt);
  } else {
    throw new Error(`Unknown key mode in blob: ${mode}`);
  }

  // Throws (OperationError) if the tag does not verify. This is the enforcement point.
  const params = { name: 'AES-GCM', iv };
  if (version === 2) {
    if (!aad) throw new Error('This blob is bound to its open track; the track digest is required.');
    params.additionalData = aad;
  }
  return new Uint8Array(await subtle.decrypt(params, key, ct));
}

// --- Small hex helpers for CLI key handling ---
export function keyToHex(u8) {
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function hexToKey(hex) {
  const clean = hex.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (clean.length !== 64) throw new Error('A raw key must be 64 hex characters (32 bytes).');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
