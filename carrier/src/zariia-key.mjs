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
//   - NOTHING IS STORED . No keyring, no localStorage. Absence is the answer
//     to a seized device; a stored key would be the thing to seize.
//   - 🔴 A KEY IS NOT MEANT TO BE REMEMBERED. Nobody can hold 24 random words in their
//     head, and nothing here asks them to. A key is written down, READ OUT, and guarded.
//     That it cannot be memorised is the design and not a cost of it: a key small enough
//     to remember is a key small enough to guess. So what a keyholder looks after is the
//     paper it is written on, not their recollection. Never write, here or on the site,
//     that a key lives in somebody's memory. (Prayas, 29 July 2026.)
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
// ── Chaff: saying a key out loud where you can be overheard ────────────────
//
// A key gets said across a table, and tables are not private. So a speaker may pad the
// utterance with nonsense words, and the listener (or this code) weeds them out.
//
// THE RULE, and it is the whole rule: **a word that is not in the BIP-0039 list is
// chaff.** Nothing else. It needs no memorising, no agreement beforehand and no second
// secret, and the 8-bit checksum then confirms that what survived is a real key.
//
// 🔴 WHAT THIS IS NOT. It does NOT hide a key from somebody who is listening properly.
// The rule is public — it is in this file — so an attentive eavesdropper applies it
// exactly as the listener does. What chaff raises is the cost of *casual* capture: a
// half-heard sentence, a bystander, a recording nobody analyses. That is a real and
// modest thing. Never describe it as security, and never let the player imply that a key
// said with chaff is safe to say anywhere.
//
// 🔴 WHY THE WEEDING WILL NOT SEARCH. The obvious extension — let chaff be any word,
// including list words, and try subsequences until the checksum passes — is UNSAFE and
// is deliberately not implemented. The checksum is 8 bits, so a wrong candidate passes
// once in 256. Allowing four in-list chaff words among 24 gives C(28,4) = 20,475
// candidates and therefore ~80 that check out. The search would return a WRONG key,
// silently, with every indication of success. A key that fails loudly is worth far more
// than one that succeeds wrongly, so chaff drawn from list words is refused, not guessed.
export function stripChaff(tokens) {
  return tokens.filter((t) => WORDLIST.includes(t));
}

/**
 * Build something safe to say aloud: the mnemonic with `count` chaff words mixed in.
 * Chaff is drawn from FILLER, which is asserted disjoint from the BIP-0039 list, so a
 * speaker never has to judge whether an improvised word collides.
 * @param {string} mnemonic 24 words
 * @param {number} count how many chaff words to interleave
 * @param {() => number} rand injectable for tests; must return [0,1)
 */
export function padMnemonic(mnemonic, count = 8, rand = () => Math.random()) {
  const words = mnemonic.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  const out = words.slice();
  for (let i = 0; i < count; i++) {
    const w = FILLER[Math.floor(rand() * FILLER.length)];
    out.splice(Math.floor(rand() * (out.length + 1)), 0, w);
  }
  return out.join(' ');
}

// Ordinary speech words, every one verified below to be absent from the BIP-0039 list.
// 🔴 Fourteen of the first forty-five words tried here were IN the wordlist — that,
// this, there, where, when, okay, right, rather, still, also, sort, kind, stuff,
// almost. BIP-0039 is 2048 short common English words, so ordinary speech collides
// with it constantly. This is why chaff is generated rather than improvised.
const FILLER_RAW = [
  'the', 'and', 'was', 'were', 'been', 'these', 'those', 'here', 'which', 'who',
  'whom', 'well', 'listen', 'anyway', 'actually', 'really', 'maybe', 'perhaps',
  'quite', 'yeah', 'hmm', 'though', 'even', 'bit', 'whatever', 'saying', 'meaning',
  'roughly', 'nearly', 'somewhere', 'anywhere', 'sometimes', 'obviously', 'basically',
  'anyhow', 'honestly', 'frankly', 'apparently', 'presumably', 'incidentally',
];
// 🔴 A filler word that IS in the wordlist would survive the weeding and break the key,
// and the failure would look like a mistyped key. So the collision is caught here, at
// module load, rather than by a listener at a table.
export const FILLER = FILLER_RAW.filter((w) => !WORDLIST.includes(w));
if (FILLER.length !== FILLER_RAW.length) {
  const bad = FILLER_RAW.filter((w) => WORDLIST.includes(w));
  throw new Error(`Filler words collide with the BIP-0039 wordlist and must be removed: ${bad.join(', ')}`);
}

export async function parseKey(input) {
  const s = String(input).trim();
  const hex = s.replace(/[^0-9a-fA-F]/g, '');
  if (/^[0-9a-fA-F\s]+$/.test(s) && hex.length === 64) return { key: hexToKey(hex), form: 'hex' };
  const toks = s.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (toks.length === 24 && toks.every((t) => WORDLIST.includes(t))) {
    return { key: await mnemonicToKey(s), form: 'words' };
  }
  // Said aloud with chaff. Weed, then require exactly 24 — never search (see above).
  if (toks.length > 24) {
    const kept = stripChaff(toks);
    if (kept.length === 24) {
      return { key: await mnemonicToKey(kept.join(' ')), form: 'words+chaff' };
    }
    if (kept.length > 24) {
      throw new Error(
        `After removing nonsense words, ${kept.length} key words remain and a key is 24. ` +
        'Some of the padding is itself a wordlist word, and guessing which would risk ' +
        'returning the wrong key. Say it again with plainer padding.');
    }
  }
  return null;
}

export { keyToHex, hexToKey };
