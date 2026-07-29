#!/usr/bin/env node
// zariia-unpack.mjs — inspection / verification CLI (the real hearing happens in the
// web player). Shows what any inspector can already see (that a sealed channel is
// present — this is open by design), and, with the key, extracts the second channel.
//
// Usage:
//   node zariia-unpack.mjs --in drop.flac                         # inspect (no key)
//   node zariia-unpack.mjs --in drop.flac --key <64hex> --out second.opus
//   node zariia-unpack.mjs --in drop.flac --passphrase <text> --out second.opus

import { readFileSync, writeFileSync } from 'node:fs';
import { unseal, KEYMODE, hexToKey } from './zariia-crypto.mjs';
import { extract, hasSealedChannel, audioDigest, extractSignature } from './zariia-flac.mjs';
import { verifyRelease } from './zariia-sign.mjs';
import { readBundle, ENTRY, codecName } from './zariia-bundle.mjs';

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

async function main() {
  const a = parseArgs(process.argv);
  if (!a.in) { console.error('Usage: node zariia-unpack.mjs --in <drop.flac> [--key <64hex>|--passphrase <text>] [--out <file>]'); process.exit(2); }

  const buf = new Uint8Array(readFileSync(a.in));
  const present = hasSealedChannel(buf);
  console.log(`Sealed channel present: ${present ? 'yes' : 'no'}  (this fact is open — anyone can see it)`);
  if (!present) return;

  const sealed = extract(buf);
  console.log(`Sealed blob size: ${(sealed.length / 1024).toFixed(1)} KB`);

  if (!a.key && !a.passphrase) {
    console.log('No key given — stopping. Content stays locked. (Presence open, content keyed.)');
    return;
  }

  const keySpec = a.key
    ? { mode: KEYMODE.RAW, rawKey: hexToKey(a.key) }
    : { mode: KEYMODE.PASSPHRASE_PBKDF2, passphrase: String(a.passphrase) };

  let plaintext;
  try {
    plaintext = await unseal(sealed, keySpec, await audioDigest(buf));
  } catch (e) {
    console.error(`Decryption failed (wrong key or tampered file): ${e.message}`);
    process.exit(1);
  }

  const entries = readBundle(plaintext);
  console.log(`Bundle entries: ${entries.length}`);
  for (const e of entries) {
    const label = Object.entries(ENTRY).find(([, v]) => v === e.type)?.[0] || `type${e.type}`;
    console.log(`  - ${label} (${codecName(e.codec)}): ${(e.bytes.length / 1024).toFixed(1)} KB`);
  }

  if (a.out) {
    const audio = entries.find((e) => e.type === ENTRY.AUDIO);
    if (!audio) { console.error('No AUDIO entry to write.'); process.exit(1); }
    writeFileSync(a.out, audio.bytes);
    console.log(`Wrote second channel to ${a.out}`);
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
