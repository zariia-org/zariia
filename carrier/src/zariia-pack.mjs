#!/usr/bin/env node
// zariia-pack.mjs — the label's authoring tool (NOT the distributed app).
//
// Takes an open track and a second-channel production, seals the second channel with
// a key, and writes a single Zariia FLAC. This is a studio-side CLI run by whoever
// prepares a drop; it is not the thing users install, so it may use ffmpeg and Node
// freely. The binding "responsive web only, no native apps" constraint governs the
// *player* (docs/concept + CLAUDE.md), which is a web page — see ../player/.
//
// Usage:
//   node zariia-pack.mjs --open song.wav --second counter.wav --out drop.flac [key opts]
//
// Key options (pick one):
//   --genkey                 generate a fresh 256-bit key, print it, use it (RAW mode, recommended)
//   --key <64-hex>           use this raw 256-bit key (RAW mode)
//   --passphrase <text>      derive the key from a passphrase (PBKDF2 — weaker; see crypto module)
//
// Second-channel codec:
//   --codec opus|flac        default opus @ 96k (small); flac = lossless but large
//   --bitrate 96k            opus bitrate
//   For maximum compression (the "open model" path) pre-encode with ../compress and
//   pass the resulting file with --second-raw <file> --codec encodec.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { seal, KEYMODE } from './zariia-crypto.mjs';
import { generateKey, keyToMnemonic, parseKey, keyToHex } from './zariia-key.mjs';
import { pack, packSignature, audioDigest } from './zariia-flac.mjs';
import { buildBundle, ENTRY, CODEC } from './zariia-bundle.mjs';
import { encodeToMimi } from './zariia-mimi.mjs';
import { signRelease } from './zariia-sign.mjs';

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const name = k.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[name] = true;
      else { a[name] = next; i++; }
    }
  }
  return a;
}

function ffmpeg(args) {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    throw new Error(`ffmpeg failed: ${e.stderr?.toString() || e.message}`);
  }
}

function toFlac(input, outPath) {
  // Lossless: the open track becomes byte-exact FLAC audio frames.
  ffmpeg(['-i', input, '-c:a', 'flac', '-compression_level', '8', outPath]);
}

function encodeSecond(input, codec, bitrate, outPath) {
  if (codec === 'opus') ffmpeg(['-i', input, '-c:a', 'libopus', '-b:a', bitrate, outPath]);
  else if (codec === 'flac') ffmpeg(['-i', input, '-c:a', 'flac', '-compression_level', '8', outPath]);
  else throw new Error(`Unsupported --codec for direct encode: ${codec}`);
}

async function main() {
  const a = parseArgs(process.argv);
  if (!a.open || !a.out || (!a.second && !a['second-raw'])) {
    console.error(
      'Usage: node zariia-pack.mjs --open <track> (--second <audio> | --second-raw <preencoded>) --out <drop.flac>\n' +
      '       [--genkey | --key "<24 words|64 hex>" --reuse-key-scene-wide] [--sign <label-key.json>]\n' +
      '       [--codec mimi|opus|flac] [--bitrate 96k]\n' +
      '  Default: generate a fresh key (printed as 24 words) and encode the sealed channel with Mimi.'
    );
    process.exit(2);
  }

  // Resolve the key. PER-DROP IS THE ENFORCED BEHAVIOUR (26 Jul 2026): a fresh key per
  // release. Reusing one across drops makes a "scene key", which cannot be revoked — one
  // leak opens the whole back catalogue, retroactively. That used to be a plain flag away,
  // which meant the property held only while nobody was in a hurry. It now costs an
  // acknowledgement that says in its own name what it does.
  let keySpec, sharedKey = null;
  if (a.key || a.words) {
    if (!a['reuse-key-scene-wide']) {
      console.error('Refusing to reuse a key across drops.\n' +
        '  A reused key is a SCENE KEY: it cannot be revoked, and one leak opens every\n' +
        '  release it ever sealed, including ones made before the leak.\n' +
        '  Per-drop keys are the design (docs/concept/the-key.md). Omit --key to mint one.\n' +
        '  If you truly mean to do this, pass --reuse-key-scene-wide.');
      process.exit(2);
    }
    const parsed = await parseKey(a.words || a.key);
    if (!parsed) { console.error('--key/--words must be a 24-word mnemonic or 64 hex chars.'); process.exit(2); }
    console.error('WARNING: sealing with a reused key. This release shares a secret with others.');
    keySpec = { mode: KEYMODE.RAW, rawKey: parsed.key };
  } else if (a.passphrase) {
    // A released file is in the wild: the attack is offline and unlimited. 600k PBKDF2
    // iterations slow each guess; a human-chosen passphrase is still exhaustible.
    if (!a['unsafe-passphrase']) {
      console.error('Refusing to seal a release with a passphrase.\n' +
        '  The file circulates publicly, so an attacker has the ciphertext and unlimited\n' +
        '  offline attempts. PBKDF2 slows each guess; it does not make a human-chosen\n' +
        '  passphrase unguessable. Use a generated key (omit --passphrase).\n' +
        '  For a local experiment only, pass --unsafe-passphrase.');
      process.exit(2);
    }
    console.error('WARNING: passphrase mode. Offline-guessable. Never ship a release like this.');
    keySpec = { mode: KEYMODE.PASSPHRASE_PBKDF2, passphrase: String(a.passphrase) };
  } else {
    sharedKey = generateKey();
    keySpec = { mode: KEYMODE.RAW, rawKey: sharedKey };
  }

  const tmp = mkdtempSync(join(tmpdir(), 'zariia-'));
  try {
    // 1. Open track -> lossless FLAC.
    const openFlac = join(tmp, 'open.flac');
    toFlac(a.open, openFlac);
    const flacBuf = new Uint8Array(readFileSync(openFlac));

    // 2. Second channel -> encoded bytes.
    // Default is the Mimi neural codec (open-weight, ~15x smaller than Opus, decoded in
    // the browser offline). Opus/flac remain available via --codec for comparison.
    const codec = (a.codec || 'mimi').toLowerCase();
    let secondBytes, codecId;
    if (a['second-raw']) {
      secondBytes = new Uint8Array(readFileSync(a['second-raw']));
      codecId = codec === 'mimi' ? CODEC.MIMI : codec === 'encodec' ? CODEC.ENCODEC : codec === 'flac' ? CODEC.FLAC : CODEC.OPUS;
    } else if (codec === 'mimi') {
      console.error('Encoding the sealed channel through Mimi (first run downloads the model)…');
      secondBytes = await encodeToMimi(a.second);
      codecId = CODEC.MIMI;
    } else {
      const ext = codec === 'flac' ? 'flac' : 'opus';
      const secondPath = join(tmp, `second.${ext}`);
      encodeSecond(a.second, codec, a.bitrate || '96k', secondPath);
      secondBytes = new Uint8Array(readFileSync(secondPath));
      codecId = codec === 'flac' ? CODEC.FLAC : CODEC.OPUS;
    }

    // 3. Bundle (audio now; room for the TOOL entry later).
    const bundle = buildBundle([{ type: ENTRY.AUDIO, codec: codecId, bytes: secondBytes }]);

    // 4. Seal the bundle, BOUND to this open track (AES-GCM additional authenticated
    //    data = SHA-256 of the audio frames). Without this the sealed block could be
    //    lifted onto a different song and would still decrypt.
    const trackDigest = await audioDigest(flacBuf);
    const sealed = await seal(bundle, keySpec, trackDigest);

    // 5. Pack into the open FLAC as ZRKA APPLICATION block(s).
    let packed = pack(flacBuf, sealed);

    // 6. Sign, if a label key was given. Origin is checkable WITHOUT the sealed key.
    if (a.sign) {
      const privateJwk = JSON.parse(readFileSync(a.sign, 'utf8'));
      const sig = await signRelease(privateJwk, trackDigest, sealed);
      packed = packSignature(packed, sig);
      console.error('Signed with the label key.');
    } else {
      console.error('NOTE: unsigned. Nothing can attest this file came from the label.');
    }
    writeFileSync(a.out, packed);

    const kb = (n) => (n / 1024).toFixed(1) + ' KB';
    console.log(`Wrote ${a.out}`);
    console.log(`  open track (FLAC frames): ${kb(flacBuf.length)}  [lossless — the song is byte-exact]`);
    console.log(`  sealed channel:           ${kb(sealed.length)}  [${codec}, presence open, content keyed]`);
    console.log(`  total object:             ${kb(packed.length)}`);
    if (sharedKey) {
      const mnem = await keyToMnemonic(sharedKey);
      console.log('\n  KEY — say these 24 words to open this record for someone:');
      console.log(`  ${mnem}`);
      console.log(`  (technical form: ${keyToHex(sharedKey)})`);
    }
    console.log('\n  Reminder: the content is only ever as safe as the key and who holds it.');
    console.log('  This object is not covert. The sealed channel is openly present; only its content is locked.');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
