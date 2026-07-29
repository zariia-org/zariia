// zariia-mimi.mjs — Node-side encode of the sealed channel through Mimi.
//
// Studio/authoring only (has internet). Loads the Mimi ONNX model via transformers.js,
// encodes an audio file to codebook indices, and serialises them with mimi-codec.mjs.
// The browser player decodes the same bytes against the same model (see player).

import { MimiModel, Tensor, env } from '@huggingface/transformers';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeMimi, MIMI_SAMPLE_RATE } from './mimi-codec.mjs';

env.allowLocalModels = false;
const MODEL = 'onnx-community/kyutai-mimi-ONNX';

let _model = null;
async function model() {
  _model ||= await MimiModel.from_pretrained(MODEL, { dtype: 'fp32' });
  return _model;
}

/**
 * Encode an audio file into serialised Mimi codes (mono, 24 kHz).
 * @param {string} inputPath any audio file ffmpeg can read
 * @returns {Promise<Uint8Array>} serialised sealed-channel bytes (codec = MIMI)
 */
export async function encodeToMimi(inputPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'zmimi-'));
  try {
    const raw = join(tmp, 'ch.f32');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', inputPath,
      '-f', 'f32le', '-ac', '1', '-ar', String(MIMI_SAMPLE_RATE), raw]);
    const buf = readFileSync(raw);
    const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);

    const m = await model();
    const input = new Tensor('float32', pcm, [1, 1, pcm.length]);
    const { audio_codes } = await m.encode({ input_values: input });
    const [, nCodebooks, nFrames] = audio_codes.dims;

    const data = audio_codes.data; // BigInt64Array
    const values = new Int32Array(data.length);
    for (let i = 0; i < data.length; i++) values[i] = Number(data[i]);

    return serializeMimi({ sampleRate: MIMI_SAMPLE_RATE, nCodebooks, nFrames, values });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
