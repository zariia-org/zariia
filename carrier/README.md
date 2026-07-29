# Zariia — the carrier

Reference implementation of the Zariia object: an openly-released music track that
carries an **encrypted second channel**, unlocked by a key. Concept:
[`../docs/concept/zariia.md`](../docs/concept/zariia.md).

Built and tested 25 July 2026. Node ≥ 20, ffmpeg. Status: working reference for the
carrier layer; the neural-codec stage is scaffolded, not wired in (see below).

---

## The one thing to get right first: this is not steganography

The concept is explicit, and the code is built to it:

> The mechanism is *encrypted*, not *buried*. This is not steganography — the second
> channel is not hidden inside the waveform so nobody can tell it is there. It is
> *locked*, not invisible.

So the design is **presence open, content keyed**. Anyone inspecting the file can see a
sealed channel is present — that is correct and intended. What the key protects is the
*content*, and only that. Nothing here hides from anyone, claims undetectability, or is
built as evasion. That honesty is not decoration: it is what keeps the object clear of
and it is written into CLAUDE.md . A claim of covertness here would be both
false and self-incriminating.

## How it works

A Zariia object is a **normal FLAC file**. Its audio frames are the open track,
byte-for-byte (FLAC is lossless, so the song truly sounds identical). The sealed second
channel rides alongside, in one or more FLAC **APPLICATION metadata blocks**:

- A conformant player is **required by the FLAC spec** to skip metadata blocks it does
  not recognise and play the audio regardless. So an ordinary player plays the open
  song and passes over the sealed part. Verified end-to-end with ffmpeg.
- The sealed block holds an AES-256-GCM encrypted bundle. With the key, the player
  decrypts it, decodes the second channel, and plays both **in sync**.

This gives the three states the concept turns on, for free:

| State | What it is | Why |
|---|---|---|
| **Streamed** | just the open song | re-encoding strips the metadata block |
| **Downloaded file** | open song + sealed channel, intact | exact bytes preserve the block |
| **File + key** | the complete work | decryption |

## Parts

```
carrier/
  src/
    zariia-crypto.mjs     AES-256-GCM seal/unseal (Web Crypto — runs in Node AND browser)
    zariia-flac.mjs       FLAC APPLICATION-block pack/extract (audio frames untouched)
    zariia-bundle.mjs     the plaintext bundle: audio now, room for the TOOL entry
    zariia-pack.mjs       CLI — the label's authoring tool (uses ffmpeg)
    zariia-unpack.mjs     CLI — inspect / verify / extract
    featherless-client.mjs  the LLM role (see "the open model", below)
  player/index.html         the distributed app: responsive web, no install (Web Audio)
  compress/encode_channel.py  optional neural-codec compression (the open model, local)
  tests/roundtrip.mjs       traces every security property; fails if one is removed
  serve.mjs                 tiny dev server for the player
```

The split matters. The **packer** is a studio-side CLI run by whoever prepares a drop —
it may use ffmpeg and Node freely, because it is not distributed. The **player** is the
thing people use, and it honours the binding constraint (CLAUDE.md): responsive web,
no native app, nothing to install, zero hardware cost.

## Use it

```bash
# 1. Pack a drop — generates a key, encodes the sealed channel with Mimi, prints 24 words
node src/zariia-pack.mjs --open song.wav --second counter.wav --out drop.flac

# 2. Anyone can inspect — presence is open, content stays locked without the key
node src/zariia-unpack.mjs --in drop.flac

# 3. Reuse a key across a scene (or a per-drop fresh one by omitting --key)
node src/zariia-pack.mjs --open s2.wav --second c2.wav --out drop2.flac --key "<24 words | 64 hex>"

# 4. Hear the complete work in the browser
node serve.mjs          # open http://localhost:8787/ , drop the file, say the 24 words

# 5. Run the property tests
npm test
```

## The key system

A key is a **256-bit CSPRNG value** (`src/zariia-key.mjs`). It has two interchangeable
forms of the same bytes:

- **24 words** — the person-to-person form (BIP-0039 mnemonic, with an 8-bit checksum).
  This is how a key is *said* to someone. It opens the record for them; it does not enrol
  them in anything (access is not membership — `docs/concept/zariia.md`, amendment of 27
  July 2026). The checksum catches a mis-heard or mis-typed word before it silently fails.
- **64 hex** — the technical form.

The packer prints both; the player accepts either (and falls back to treating anything
else as a passphrase → PBKDF2, the weaker path, kept only for convenience). Full 256-bit
entropy in RAW mode means there is **no offline-guessing surface** — unlike a spoken
passphrase, whose ciphertext is public .

**Per-drop or per-scene is a usage choice, not a mechanism.** Generate a fresh key per
drop, or reuse one key across every drop in a scene (`--key`). "One scene key" vs
"per-drop keys" (`zariia.md` "Open") is decided by whether the label reuses a key — the
code is identical either way.

**Nothing is stored** . No keyring, no localStorage — the key lives in a
person's memory or on paper and is entered per session; after unlocking, the player can
show the words again so a keyholder can pass them on. Absence is the answer to a seized
device.

The one boundary that cannot be engineered away: **the content is only ever as safe as
the key and who holds it.** The music sounding identical is solved; confidentiality rests
entirely on key handling. There is nothing else to over-claim.

## The open model: Mimi (Kyutai), encode in Node, decode in the browser

The sealed channel is compressed with an **open-weight neural audio codec — Kyutai's
Mimi** (`onnx-community/kyutai-mimi-ONNX`), run through **transformers.js**. This is the
"open model" doing the sound-channel work, and it replaces Opus (which is why it is gone).

Two facts settle the architecture:

1. **The same ONNX model runs both sides.** The Node packer encodes the channel to Mimi
   codebook indices (`src/zariia-mimi.mjs`); the browser player decodes those exact
   indices with the decoder-only model (`MimiDecoderModel`, q8, ~88 MB). Same weights →
   the codes are byte-compatible; no format bridge to get wrong.
2. **The decode never calls an API — it cannot.** Decoding happens on the listener's device, possibly offline. So the
   decoder is loaded into the page and cached (one fetch, then a service
   worker serves it offline). A **hosted** audio model is therefore ruled out on purpose —
   and, checked live on 25 July 2026, neither **Featherless** (`api.featherless.ai`, a
   text/chat host — `/v1/audio/*` all 404, every "audio" model is a text LLM) nor an
   OpenRouter audio model is a codec anyway; those are transcription / understanding / TTS,
   which cannot compress a music channel. The neural codec is the only tool for this job,
   and it must run locally.

**Measured (25 July 2026):** a 6-second second channel is **4.7 KB via Mimi** versus
**82.8 KB via Opus at 96 kbps — ~17× smaller.** A four-minute channel lands in the low
hundreds of KB. That is the whole reason for the model: cheap re-fetch under cache
eviction, and headroom for the messaging *tool* to ride in the same sealed channel.

**The tradeoff, stated plainly and now paid deliberately.** The browser cannot natively
decode Mimi, so the player carries the decoder (~88 MB, fetched once, cached). That is
real weight, in tension with "keep the tool tiny" — accepted because the payload the tool
*distributes* stays tiny and the decoder is one-time. Productionisation to do: pin a
smaller dtype if quality allows (q4f16 ≈ 78 MB), self-host the model + WASM (currently
jsDelivr + HF Hub), and wire the service worker so the second load is fully offline.

**Featherless still has an honest role — the language layer, not audio.** The key drives
`src/featherless-client.mjs` (open-weight LLM, default `Qwen/Qwen3-30B-A3B-Instruct-2507`)
for the messaging tool's text and liner notes — never the trust path .

## What is verified, and what is not

Verified (Node + real browser, 25 July 2026):

- Pack → extract → decrypt reproduces the sealed bytes exactly.
- The open track's decoded PCM is **identical** before and after packing (lossless +
  verbatim frames — the song is untouched).
- A conformant decoder (ffmpeg) and a real browser (Chrome, Web Audio) play the open
  track; ffprobe sees the extra APPLICATION block (presence open, by design).
- **The Mimi path, end to end in the browser:** Node encodes the channel to Mimi (4.7 KB),
  it is sealed into the FLAC, and the player unseals → deserialises → decodes with
  transformers.js `MimiDecoderModel` → **6.0 s of real audio** (RMS 0.128, healthy peak),
  playing in sync with the open track. Decoder downloaded and ran in ~31 s first time.
- Wrong key / tampered ciphertext → decryption **throws** (GCM tag enforced, not merely
  observed — `tests/roundtrip.mjs` fails if this regresses).
- The Featherless key is live (free `/models` call; no inference credit spent) — and
  confirmed text-only (no audio endpoints).

Not done / open (belongs to Prayas, per concept and CLAUDE.md):

- **The key system is built** (24-word mnemonic + hex, checksummed, nothing stored;
  per-drop or per-scene by usage). Still open by design: a **public-key admission**
  scheme, so a newcomer could be brought in without a pre-shared secret — a real future
  path, deliberately not built yet (it adds an identity layer; density-not-mass first).
- **The TOOL entry** (bundling the messaging tool alongside the audio) has a defined slot
  in the bundle format but is not populated — that waits on the tool itself and on the
  project's Phase 0 answers (`../CLAUDE.md`).
- **Carrier > 16 MB** sealed channels chain across APPLICATION blocks; tested small, not
  at multi-block scale.
- **The player surface** was rebuilt through the `frontend-design-prayas` skill
  (25 Jul 2026) on the Zariia brand — see `../brand/` (symbol, wordmark, palette,
  `brand.html`). The two channels are the live hero: the open song a full gold column,
  the sealed channel an empty cold vessel that fills with vermilion light on unlock. It
  remains a self-contained page (brand tokens + symbol inlined).
- **iOS cache eviction**  is unverified and material to whether the
  downloaded-file model holds on iPhones.

## A caveat that is not a bug

A full-fidelity sealed channel survives only where the exact file survives. Streaming
re-encodes and strips it. That is the design (the streamed song is the public shell; the
complete object lives in the downloaded file), not a fault to fix.
