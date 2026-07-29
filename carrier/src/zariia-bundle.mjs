// zariia-bundle.mjs
//
// What sits inside the sealed channel once decrypted: not a bare audio blob, but a small
// self-describing bundle of typed entries. The player reads the audio entry to complete
// the song. Deliberately trivial and readable (trust
// work is deterministic, local and legible — sophistication here is a defect).
//
// Bundle layout (big-endian):
//   [0..3]  magic "ZBND"
//   [4]     version = 1
//   [5]     entry count
//   then, per entry:
//     [1]   type   (ENTRY.*)
//     [1]   codec  (CODEC.* — meaningful for AUDIO; 0 otherwise)
//     [4]   length
//     [len] bytes

// TOOL = 2 is VESTIGIAL. It belongs to the scope retired on 26 July 2026 (a messaging
// tool shipped inside the sealed channel — docs/archive-shutdown-tool/), and nothing
// writes or reads it. The number is kept reserved so an old file cannot be misparsed;
// do not build anything on it, and do not describe the format as carrying a tool.
export const ENTRY = { AUDIO: 1, TOOL: 2, NOTE: 3 };
export const CODEC = { OPUS: 0, FLAC: 1, ENCODEC: 2, PCM_WAV: 3, MP3: 4, MIMI: 5 };

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * @param {Array<{type:number, codec?:number, bytes:Uint8Array}>} entries
 * @returns {Uint8Array}
 */
export function buildBundle(entries) {
  if (entries.length > 255) throw new Error('Too many bundle entries (max 255).');
  const head = new Uint8Array(6);
  head.set(enc.encode('ZBND'), 0);
  head[4] = 1;
  head[5] = entries.length;

  const parts = [head];
  for (const e of entries) {
    const h = new Uint8Array(6);
    h[0] = e.type;
    h[1] = e.codec ?? 0;
    const len = e.bytes.length;
    h[2] = (len >>> 24) & 0xff;
    h[3] = (len >>> 16) & 0xff;
    h[4] = (len >>> 8) & 0xff;
    h[5] = len & 0xff;
    parts.push(h, e.bytes);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * @param {Uint8Array} buf
 * @returns {Array<{type:number, codec:number, bytes:Uint8Array}>}
 */
export function readBundle(buf) {
  if (buf.length < 6 || dec.decode(buf.subarray(0, 4)) !== 'ZBND') {
    throw new Error('Not a Zariia bundle (bad magic).');
  }
  const version = buf[4];
  if (version !== 1) throw new Error(`Unsupported bundle version: ${version}`);
  const count = buf[5];
  const entries = [];
  let off = 6;
  for (let i = 0; i < count; i++) {
    if (off + 6 > buf.length) throw new Error('Truncated bundle entry header.');
    const type = buf[off];
    const codec = buf[off + 1];
    const len = (buf[off + 2] << 24) | (buf[off + 3] << 16) | (buf[off + 4] << 8) | buf[off + 5];
    const start = off + 6;
    const end = start + len;
    if (end > buf.length) throw new Error('Bundle entry overruns buffer.');
    entries.push({ type, codec, bytes: buf.subarray(start, end) });
    off = end;
  }
  return entries;
}

export function codecName(c) {
  return Object.entries(CODEC).find(([, v]) => v === c)?.[0]?.toLowerCase() ?? 'unknown';
}
