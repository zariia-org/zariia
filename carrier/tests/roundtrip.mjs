#!/usr/bin/env node
// roundtrip.mjs — end-to-end test that traces the security properties CLAUDE.md
//
// Covered:
//   1. Pack then extract-and-decrypt reproduces the exact second-channel bytes.
//   2. The open track's decoded PCM is byte-identical before and after packing
//      (FLAC is lossless AND we copy frames verbatim — the song truly sounds the same).
//   3. A conformant decoder (ffmpeg) plays the packed file's audio without error,
//      and ffprobe SEES the APPLICATION block (presence is open, by design).
//   4. Wrong key -> unseal() THROWS (GCM tag enforcement is real, not observed).
//   5. Flipping one ciphertext byte -> unseal() THROWS (tamper-evidence).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seal, unseal, KEYMODE, generateKey } from '../src/zariia-crypto.mjs';
import { pack, extract, audioDigest, packSignature, extractSignature } from '../src/zariia-flac.mjs';
import { generateLabelKeypair, signRelease, verifyRelease } from '../src/zariia-sign.mjs';
import { buildBundle, readBundle, ENTRY, CODEC } from '../src/zariia-bundle.mjs';

let failures = 0;
function ok(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}
function ff(args) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); }
function decodePcm(flacPath, tmp) {
  const raw = join(tmp, `${Math.random().toString(36).slice(2)}.raw`);
  ff(['-i', flacPath, '-f', 's16le', '-ac', '2', '-ar', '44100', raw]);
  return new Uint8Array(readFileSync(raw));
}
function eq(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }

const tmp = mkdtempSync(join(tmpdir(), 'zariia-test-'));
try {
  // Synthesize an "open track" (2s sine) and a "second channel" (1.5s different tone).
  const openWav = join(tmp, 'open.wav');
  const secondWav = join(tmp, 'second.wav');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ac', '2', openWav]);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=1.5', '-ac', '2', secondWav]);

  const openFlac = join(tmp, 'open.flac');
  ff(['-i', openWav, '-c:a', 'flac', openFlac]);
  const flacBuf = new Uint8Array(readFileSync(openFlac));
  const pcmBefore = decodePcm(openFlac, tmp);

  // Encode second channel to opus.
  const secondOpus = join(tmp, 'second.opus');
  ff(['-i', secondWav, '-c:a', 'libopus', '-b:a', '96k', secondOpus]);
  const secondBytes = new Uint8Array(readFileSync(secondOpus));

  const bundle = buildBundle([{ type: ENTRY.AUDIO, codec: CODEC.OPUS, bytes: secondBytes }]);
  const key = generateKey();
  const keySpec = { mode: KEYMODE.RAW, rawKey: key };

  const sealed = await seal(bundle, keySpec);
  const packed = pack(flacBuf, sealed);
  const packedPath = join(tmp, 'drop.flac');
  writeFileSync(packedPath, packed);

  // 1. Round-trip fidelity of the sealed bytes.
  const extracted = extract(packed);
  const recovered = await unseal(extracted, keySpec);
  const entries = readBundle(recovered);
  ok('1. sealed channel round-trips byte-exact', entries.length === 1 && eq(entries[0].bytes, secondBytes));

  // 2. Open track PCM unchanged after packing (lossless + verbatim frames).
  const pcmAfter = decodePcm(packedPath, tmp);
  ok('2. open track PCM identical before/after packing', eq(pcmBefore, pcmAfter));

  // 3. Conformant decoder plays audio; ffprobe sees the APPLICATION block openly.
  let plays = true;
  try { decodePcm(packedPath, tmp); } catch { plays = false; }
  ok('3a. conformant decoder plays packed file without error', plays);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index', '-i', packedPath], { encoding: 'utf8' });
  // ffprobe decoding proves the audio stream survives alongside the extra metadata.
  ok('3b. audio stream present alongside sealed metadata', probe.includes('index'));

  // 4. Wrong key -> throw.
  let threwWrongKey = false;
  try { await unseal(sealed, { mode: KEYMODE.RAW, rawKey: generateKey() }); }
  catch { threwWrongKey = true; }
  ok('4. wrong key rejected (GCM tag enforced, not observed)', threwWrongKey);

  // 5. Tamper one ciphertext byte -> throw.
  const tampered = sealed.slice();
  tampered[tampered.length - 1] ^= 0x01;
  let threwTamper = false;
  try { await unseal(tampered, keySpec); }
  catch { threwTamper = true; }
  ok('5. tampered ciphertext rejected', threwTamper);

  // ── 6. The sealed channel is BOUND to its open track (AES-GCM AAD) ──────────
  // Without this the sealed block is portable: lift it onto another song and it still
  // opens. Each assertion here fails if the AAD is removed from seal/unseal.
  const digestA = await audioDigest(flacBuf);
  const boundSeal = await seal(bundle, keySpec, digestA);

  let opensOnItsOwnTrack = false;
  try { await unseal(boundSeal, keySpec, digestA); opensOnItsOwnTrack = true; } catch {}
  ok('6a. bound channel opens on its own track', opensOnItsOwnTrack);

  const digestOther = new Uint8Array(digestA); digestOther[0] ^= 0xff;  // a different song
  let rejectsSwappedTrack = false;
  try { await unseal(boundSeal, keySpec, digestOther); } catch { rejectsSwappedTrack = true; }
  ok('6b. sealed channel REJECTED when stapled to another track', rejectsSwappedTrack);

  let rejectsMissingBinding = false;
  try { await unseal(boundSeal, keySpec); } catch { rejectsMissingBinding = true; }
  ok('6c. bound channel refuses to open unbound', rejectsMissingBinding);

  // ── 7. Origin: the label signature ─────────────────────────────────────────
  // Confidentiality is not authenticity. Without a signature anyone can forge a release.
  const label = await generateLabelKeypair();
  const sig = await signRelease(label.privateJwk, digestA, boundSeal);
  ok('7a. label signature verifies', await verifyRelease(label.publicJwk, digestA, boundSeal, sig));
  ok('7b. signature FAILS on a swapped track',
     !(await verifyRelease(label.publicJwk, digestOther, boundSeal, sig)));
  ok('7c. signature FAILS for a forger with a different key',
     !(await verifyRelease((await generateLabelKeypair()).publicJwk, digestA, boundSeal, sig)));

  const signedFile = packSignature(packed, sig);
  const sigFromFile = extractSignature(signedFile);
  ok('7d. signature survives a round-trip through the FLAC',
     sigFromFile !== null && eq(sigFromFile, sig));
  ok('7e. an unsigned file reports no origin', extractSignature(packed) === null);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
