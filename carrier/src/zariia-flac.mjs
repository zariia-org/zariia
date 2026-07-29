// zariia-flac.mjs
//
// The container layer. A Zariia object is a normal FLAC file whose audio is the
// open track, carrying the sealed channel in one or more FLAC APPLICATION metadata
// blocks. This is the honest fit for the concept (docs/concept/zariia.md):
//
//   - The sealed channel rides ALONGSIDE the open track, not inside its waveform.
//     No steganography, no capacity ceiling, no fragile concealment.
//   - Presence is open: anyone inspecting the file sees an APPLICATION block. That is
//     correct and intended. Only the block's CONTENT is keyed (see zariia-crypto).
//   - FLAC is lossless, so "the song sounds identical" is literally true — the audio
//     frames are byte-for-byte the input. The three states follow for free:
//       streamed  -> re-encode strips the block -> just the open song (the lure)
//       file      -> exact bytes -> sealed channel intact
//       file+key  -> the complete work (access to the record — not membership)
//
// Property trace (CLAUDE.md ):
//   - "Ordinary players ignore the block." This is SPEC-MANDATED, not hoped-for. The
//     FLAC format specification requires decoders to skip APPLICATION (and any
//     unknown) metadata blocks and decode the audio frames regardless. A conformant
//     player therefore plays the open track and never mistakes the sealed bytes for
//     audio. A NON-conformant player at worst ignores or errors on the block — it
//     still cannot render ciphertext as sound, because the audio frames are a
//     separate, untouched region of the file. Verified end-to-end by ffmpeg/ffprobe
//     in tests/roundtrip.mjs: the packed file decodes to audio identical to the
//     source, and ffprobe lists the extra APPLICATION block.
//   - Audio integrity: pack() copies the original audio-frame region verbatim; it
//     never re-encodes. Test asserts the decoded PCM of packed == source.

const FLAC_MARKER = new Uint8Array([0x66, 0x4c, 0x61, 0x43]); // "fLaC"
const APP_ID = new Uint8Array([0x5a, 0x52, 0x4b, 0x41]); // "ZRKA" — the sealed channel
// "ZRKS" — the label signature. Deliberately OUTSIDE the encryption: origin must be
// checkable by anyone holding the file, with or without the key. (Added 26 Jul 2026 —
// before this, the carrier had confidentiality but no authenticity at all: anyone could
// forge a "Zariia release" and nothing could tell.)
const APP_ID_SIG = new Uint8Array([0x5a, 0x52, 0x4b, 0x53]);
const BLOCKTYPE_APPLICATION = 2;
const MAX_BLOCK_DATA = 0xffffff; // 24-bit length field
const MAX_APP_PAYLOAD = MAX_BLOCK_DATA - APP_ID.length; // room after the 4-byte app id

function u24be(n) {
  return new Uint8Array([(n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

/**
 * Parse a FLAC file into its metadata blocks and the trailing audio-frame region.
 * @param {Uint8Array} buf whole file
 * @returns {{blocks: Array<{type:number, last:boolean, data:Uint8Array}>, frames: Uint8Array}}
 */
export function parseFlac(buf) {
  if (buf.length < 4 || !buf.subarray(0, 4).every((b, i) => b === FLAC_MARKER[i])) {
    throw new Error('Not a FLAC file (missing "fLaC" marker). Convert the open track to FLAC first.');
  }
  const blocks = [];
  let off = 4;
  while (true) {
    if (off + 4 > buf.length) throw new Error('Truncated FLAC metadata.');
    const header = buf[off];
    const last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const len = (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
    const dataStart = off + 4;
    const dataEnd = dataStart + len;
    if (dataEnd > buf.length) throw new Error('FLAC metadata block overruns file.');
    blocks.push({ type, last, data: buf.subarray(dataStart, dataEnd) });
    off = dataEnd;
    if (last) break;
  }
  if (blocks.length === 0 || blocks[0].type !== 0) {
    throw new Error('First FLAC metadata block must be STREAMINFO.');
  }
  return { blocks, frames: buf.subarray(off) };
}

/** Serialise one metadata block (header + data). */
function serialiseBlock(type, last, data) {
  const header = new Uint8Array(4);
  header[0] = (last ? 0x80 : 0x00) | (type & 0x7f);
  header.set(u24be(data.length), 1);
  const out = new Uint8Array(4 + data.length);
  out.set(header, 0);
  out.set(data, 4);
  return out;
}

/** Wrap a chunk of sealed bytes as APPLICATION block data (app id prefix + chunk). */
function appBlockData(chunk) {
  const data = new Uint8Array(APP_ID.length + chunk.length);
  data.set(APP_ID, 0);
  data.set(chunk, APP_ID.length);
  return data;
}

/**
 * Insert a sealed blob into a FLAC file as one or more ZRKA APPLICATION blocks.
 * Existing metadata is preserved; audio frames are copied verbatim.
 * @param {Uint8Array} flacBuf the open track as FLAC
 * @param {Uint8Array} sealedBlob output of seal()
 * @returns {Uint8Array} the Zariia FLAC file
 */
export function pack(flacBuf, sealedBlob) {
  const { blocks, frames } = parseFlac(flacBuf);

  // Drop any pre-existing ZRKA blocks so re-packing is idempotent, not additive.
  const kept = blocks.filter(
    (b) => !(b.type === BLOCKTYPE_APPLICATION && b.data.length >= 4 && b.data.subarray(0, 4).every((x, i) => x === APP_ID[i]))
  );

  // Split the sealed blob across as many APPLICATION blocks as needed.
  const chunks = [];
  for (let i = 0; i < sealedBlob.length; i += MAX_APP_PAYLOAD) {
    chunks.push(sealedBlob.subarray(i, Math.min(i + MAX_APP_PAYLOAD, sealedBlob.length)));
  }
  const zrkaBlocks = chunks.map((c) => ({ type: BLOCKTYPE_APPLICATION, data: appBlockData(c) }));

  // Rebuild: STREAMINFO first, other kept metadata, then our ZRKA blocks.
  // Exactly one block — the final one — carries the last-metadata-block flag.
  const streaminfo = kept[0];
  const otherMeta = kept.slice(1);
  const ordered = [
    { type: streaminfo.type, data: streaminfo.data },
    ...otherMeta.map((b) => ({ type: b.type, data: b.data })),
    ...zrkaBlocks,
  ];

  const parts = [FLAC_MARKER];
  ordered.forEach((b, i) => {
    const isLast = i === ordered.length - 1;
    parts.push(serialiseBlock(b.type, isLast, b.data));
  });
  parts.push(frames);

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
 * Extract the sealed blob from a Zariia FLAC by concatenating all ZRKA
 * APPLICATION blocks in order. Returns null if none present.
 * @param {Uint8Array} flacBuf
 * @returns {Uint8Array|null}
 */
export function extract(flacBuf) {
  const { blocks } = parseFlac(flacBuf);
  const chunks = blocks
    .filter(
      (b) => b.type === BLOCKTYPE_APPLICATION && b.data.length >= 4 && b.data.subarray(0, 4).every((x, i) => x === APP_ID[i])
    )
    .map((b) => b.data.subarray(4));
  if (chunks.length === 0) return null;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Attach (or replace) the label signature block. */
export function packSignature(flacBuf, sigBytes) {
  const { blocks, frames } = parseFlac(flacBuf);
  const kept = blocks.filter(
    (b) => !(b.type === BLOCKTYPE_APPLICATION && b.data.length >= 4 && b.data.subarray(0, 4).every((x, i) => x === APP_ID_SIG[i]))
  );
  const data = new Uint8Array(APP_ID_SIG.length + sigBytes.length);
  data.set(APP_ID_SIG, 0);
  data.set(sigBytes, APP_ID_SIG.length);

  const ordered = [...kept.map((b) => ({ type: b.type, data: b.data })),
                   { type: BLOCKTYPE_APPLICATION, data }];
  const parts = [FLAC_MARKER];
  ordered.forEach((b, i) => parts.push(serialiseBlock(b.type, i === ordered.length - 1, b.data)));
  parts.push(frames);
  const total = parts.reduce((n, x) => n + x.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}

/** The label signature, or null if the file is unsigned. */
export function extractSignature(flacBuf) {
  const { blocks } = parseFlac(flacBuf);
  const b = blocks.find(
    (x) => x.type === BLOCKTYPE_APPLICATION && x.data.length >= 4 && x.data.subarray(0, 4).every((v, i) => v === APP_ID_SIG[i])
  );
  return b ? b.data.subarray(4) : null;
}

/**
 * SHA-256 of the OPEN AUDIO FRAMES — used as AES-GCM additional authenticated data so
 * the sealed channel is cryptographically bound to the track it rides beside.
 *
 * Why this exists (added 26 Jul 2026): without it the sealed blob is independent of the
 * audio, so anyone could lift release A's sealed block, staple it onto release B's audio,
 * and it would decrypt perfectly with A's key. "The complete work" was a convention of how
 * the file was assembled rather than anything the file could attest. With the frames as
 * AAD, a swapped pairing fails to open instead of playing two things never meant to sound
 * together.
 *
 * Frames only — NOT the metadata blocks — because pack() adds blocks and must not change
 * the digest.
 */
export async function audioDigest(flacBuf) {
  const { frames } = parseFlac(flacBuf);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', frames));
}

/** True if the file carries a sealed channel (presence is openly inspectable — by design). */
export function hasSealedChannel(flacBuf) {
  try {
    return extract(flacBuf) !== null;
  } catch {
    return false;
  }
}

export { MAX_APP_PAYLOAD, APP_ID };
