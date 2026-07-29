// mimi-codec.mjs
//
// Serialisation for the Mimi (Kyutai) neural-codec sealed channel. Pure — no deps —
// so the same code runs in the Node packer and the browser player. The heavy lifting
// (the neural encode/decode) is done by transformers.js on each side against the SAME
// ONNX model (onnx-community/kyutai-mimi-ONNX), which is why the codes produced in Node
// decode identically in the browser: they are codebook INDICES, not audio.
//
// Why Mimi and not Opus (Prayas, 25 Jul 2026): the sealed channel must stay small — a
// browser can evict the cached page, so re-fetch must be cheap, and the same channel is
// meant to carry the tool alongside the music. Mimi is ~15x smaller than Opus at 96 kbps
// (measured: 2.4 KB vs ~36 KB for 3 s). It is an open-weight model, which is the point.
//
// Why the neural DECODE runs in the browser and never calls an API: the player must work
// happens on the listener's phone, possibly offline — so the decoder is compiled into the
// page (transformers.js + the cached model), never a network request. A hosted "audio
// model" (Featherless/OpenRouter) cannot serve this role: those are text/understanding
// APIs, and any API is unreachable exactly when the tool is for.
//
// Blob layout (big-endian numeric):
//   [0..3]  magic "MIMI"
//   [4]     version = 1
//   [5..8]  sampleRate (uint32)
//   [9..10] nCodebooks (uint16)
//   [11..14] nFrames   (uint32)
//   [15..]  nCodebooks*nFrames codes as uint16 LE (Mimi indices are < 2048)

export const MIMI_MAGIC = 'MIMI';
export const MIMI_SAMPLE_RATE = 24000;
const HEAD = 15;

export function serializeMimi({ sampleRate, nCodebooks, nFrames, values }) {
  const n = nCodebooks * nFrames;
  if (values.length !== n) throw new Error(`Mimi serialise: expected ${n} values, got ${values.length}`);
  const out = new Uint8Array(HEAD + n * 2);
  const dv = new DataView(out.buffer);
  out[0] = 0x4d; out[1] = 0x49; out[2] = 0x4d; out[3] = 0x49; // "MIMI"
  dv.setUint8(4, 1);
  dv.setUint32(5, sampleRate);
  dv.setUint16(9, nCodebooks);
  dv.setUint32(11, nFrames);
  let o = HEAD;
  for (let i = 0; i < n; i++) { dv.setUint16(o, values[i]); o += 2; }
  return out;
}

export function deserializeMimi(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!(bytes[0] === 0x4d && bytes[1] === 0x49 && bytes[2] === 0x4d && bytes[3] === 0x49)) {
    throw new Error('Not a Mimi sealed channel (bad magic).');
  }
  const sampleRate = dv.getUint32(5);
  const nCodebooks = dv.getUint16(9);
  const nFrames = dv.getUint32(11);
  const n = nCodebooks * nFrames;
  const values = new Int32Array(n);
  let o = HEAD;
  for (let i = 0; i < n; i++) { values[i] = dv.getUint16(o); o += 2; }
  return { sampleRate, nCodebooks, nFrames, values };
}
