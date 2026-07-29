// zariia-key.mjs — the Zariia key system. Pure Web Crypto, runs in Node and browser.
//
// The concept (docs/concept/zariia.md): "the key passes person to person." It arrives
// because somebody thought of you — and note what that does NOT mean: access is not
// membership (amendment of 27 July 2026; the key opens a record, involvement is what the
// scene is made of). So a key is not only a 256-bit blob — it has
// a HUMANE form you can say to someone: a 24-word mnemonic (BIP-0039), with a checksum
// that catches a mis-heard or mis-typed word before it silently fails to unlock.
//
//   - The secret is a 256-bit CSPRNG value (getRandomValues). Full entropy — RAW mode in
//     zariia-crypto — so there is no offline-guessing surface (unlike a passphrase).
//   - Two interchangeable FORMS of the same 32 bytes: the word mnemonic (to pass hand to
//     hand) and hex (technical). Both round-trip losslessly.
//   - NOTHING IS STORED . No keyring, no localStorage. The key lives in a
//     person's memory or on paper and is entered per session. Absence is the answer to a
//     seized device; a stored key would be the thing to seize.
//   - Per-drop or per-scene is a USAGE choice, not a mechanism: the same key can seal one
//     drop or every drop in a scene. "One scene key" vs "per-drop keys" (zariia.md
//     "Open") is decided by whether the label reuses a key, not by different code.

import { WORDLIST } from './bip39-wordlist.mjs';
import { keyToHex, hexToKey } from './zariia-crypto.mjs';

const subtle = globalThis.crypto?.subtle;

/** Fresh 256-bit key (CSPRNG). This IS the secret; everything else is a view of it. */
export function generateKey() {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

/** 32-byte key -> 24-word mnemonic (BIP-0039: 256 entropy bits + 8 checksum bits). */
export async function keyToMnemonic(key) {
  if (key.byteLength !== 32) throw new Error('Key must be 32 bytes.');
  const hash = new Uint8Array(await subtle.digest('SHA-256', key));
  const bits = [];
  for (const b of key) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  for (let i = 0; i < 8; i++) bits.push((hash[0] >> (7 - i)) & 1); // 8 checksum bits
  const words = [];
  for (let i = 0; i < bits.length; i += 11) {
    let idx = 0;
    for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i + j];
    words.push(WORDLIST[idx]);
  }
  return words.join('-');   // hyphen-joined: no spaces, URL-safe, no CLI quoting needed
}

/** 24-word mnemonic -> 32-byte key. Throws if a word is unknown or the checksum fails. */
export async function mnemonicToKey(mnemonic) {
  const words = mnemonic.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (words.length !== 24) throw new Error(`A Zariia key is 24 words (got ${words.length}).`);
  const bits = [];
  for (const w of words) {
    const idx = WORDLIST.indexOf(w);
    if (idx < 0) throw new Error(`"${w}" is not a Zariia key word.`);
    for (let j = 10; j >= 0; j--) bits.push((idx >> j) & 1);
  }
  const key = new Uint8Array(32);
  for (let i = 0; i < 256; i++) if (bits[i]) key[i >> 3] |= 1 << (7 - (i % 8));
  const hash = new Uint8Array(await subtle.digest('SHA-256', key));
  for (let i = 0; i < 8; i++) {
    if (((hash[0] >> (7 - i)) & 1) !== bits[256 + i]) {
      throw new Error('Key checksum failed — a word is wrong or out of order.');
    }
  }
  return key;
}

/**
 * Accept a key in either form. Returns { key, form } or null if the input is neither a
 * 24-word mnemonic nor 64 hex chars (so the caller may treat it as a passphrase instead).
 */
export async function parseKey(input) {
  const s = String(input).trim();
  const hex = s.replace(/[^0-9a-fA-F]/g, '');
  if (/^[0-9a-fA-F\s]+$/.test(s) && hex.length === 64) return { key: hexToKey(hex), form: 'hex' };
  const toks = s.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (toks.length === 24 && toks.every((t) => WORDLIST.includes(t))) {
    return { key: await mnemonicToKey(s), form: 'words' };
  }
  return null;
}

export { keyToHex, hexToKey };
