# Zariia

A music label. It releases records that carry a sealed second channel, unlocked by a key.

The released track plays for anyone and sounds whole. Held with the key, a second channel unlocks
and plays in sync, and what you hear then is the complete work. The sealed channel is **encrypted,
not hidden** — anyone inspecting the file can see it is there. It sits in a standard FLAC metadata
block under AES-256-GCM, so any language with an AES library can open it given the key. There is no
player to install and no account to hold.

**Access is not membership.** The key opens a record. Being involved in the scene is what makes
somebody part of it — being in the room, playing, hosting, bringing somebody, being asked back — and
the key is the residue of that involvement rather than the route into it. A key passed onward makes
the recipient a listener who knows somebody, which is a real thing and is not membership.

**There is no music yet.** That is the only thing standing between this and being a real label.

Site: **https://zariia.org** · Ahmedabad · Prayas Abhinav

---

## Hear it work

There is a demo record on the site, with its key printed beside it, at
**https://zariia.org/player.html** — press *Load the demo record*, then *Unlock*.

Nothing is uploaded and nothing is installed. The page decrypts in the browser and plays both
channels in sync. Six seconds, made to be taken apart rather than listened to.

## What is in here

```
carrier/    the object itself. Sealed channel bound to its open track so it cannot be
            lifted onto another record, label signing, per-drop keys, no-passphrase
            enforced. `npm test` — 14 assertions.
website/    zariia.org. Ten pages and a working player.
brand/      mark, lockup, palette, brand sheet. All three in sync.
docs/concept/
            the form and the carrier · where the name comes from · how the key is
            distributed · what this is an instance of
```

This is the published half of a larger working repo. Curatorial notes, funding, open questions and
the internal process record are kept out of it, so a comment here that points at a document you
cannot see is pointing into that one, not at something missing.

## How a record is opened

A Zariia object is an ordinary FLAC file.

- The **audio frames are the open track, byte for byte.** FLAC is lossless, so the song truly sounds
  identical whether or not you hold the key.
- The **sealed channel rides alongside**, in a FLAC `APPLICATION` metadata block with the id `ZRKA`.
  The FLAC specification requires a decoder to skip metadata blocks it does not recognise and play
  the audio regardless, so an ordinary player plays the open song and passes over the sealed part.
- That block holds an **AES-256-GCM** bundle. Given the key, it decrypts to a small self-describing
  structure whose audio entry is the second channel.

Three states follow, without anything having to enforce them. **Streamed**, you get the open song,
because re-encoding strips the metadata block. **Downloaded**, you have the open song and an intact
sealed channel you cannot hear. **File and key together**, the complete work.

Nothing is hidden. Presence is open and only content is keyed, which is what the object honestly is
rather than a legal posture. The format is written out in `carrier/README.md`, and the modules that
implement it are readable here and served live at `zariia.org/lib/`.

**The key** is 256 bits, in two interchangeable forms: 24 words (BIP-0039, with a checksum that
catches a mis-heard word) for saying to someone, and 64 hex characters for machines. Nothing is
stored — no keyring, no `localStorage`. A key lives in a person's memory or on paper.

The one boundary that cannot be engineered away: **the content is only ever as safe as the key and
who holds it.** The music sounding identical is solved. Confidentiality rests entirely on key
handling, and there is nothing else to claim.

## Working on it

```bash
cd carrier && npm install && npm test        # 14 assertions
cd website && python3 -m http.server 8765    # then http://localhost:8765
```

Pack a drop, and mint a key for it:

```bash
node carrier/src/zariia-pack.mjs --open song.wav --second counter.wav --out drop.flac --genkey
node carrier/src/zariia-unpack.mjs --in drop.flac            # presence is open; content stays locked
```

**Deploying the site.** Three things bite, and all three fail silently with a green log.

1. `caprover deploy` uploads `zariia.tar` and nothing else. If that file was not regenerated it
   ships the previous build and reports success. Always `./make-caprover-tar.sh` first, and after
   deploying, `curl` the live page and grep for a string you just changed. A green deploy log is not
   evidence that anything is live.
2. **A new file needs adding to two lists** — `REQUIRED_FILES` in `make-caprover-tar.sh` *and* the
   `COPY` line in `Dockerfile`. Miss the second and the tarball contains the file while the image
   does not: the deploy succeeds and the URL 404s. This happened three times — a directory of
   photographs, a page, and the demo record — so the build now cross-checks the two lists and
   refuses when they disagree.
3. **A 404 straight after a deploy may be a cached 404.** An edge cache will serve the negative
   response you generated while the file was missing, for hours after you ship it. Re-request with a
   changed query string before concluding anything failed.

Stylesheets are served `max-age=604800`, so bump the `?v=` on the `fonts.css` and `zariia.css` links
across every page whenever the CSS changes.

**No frontend ships without a render-and-look pass.** Not a code read — a render, at 1920 and at
760, with a real 1080 viewport height. A page can be correct in the source, served with a 200, and
still be unreadable; that has happened here twice.

## The player fetches nothing

The site's Content-Security-Policy is strictly same-origin and the build fails if an off-site origin
reappears. Sealed channels use Opus — the audio codec, which every browser already decodes — so
there is no model or decoder to download and no third party involved in opening a record.

It was not always so, and the failure is worth recording. The player used to fetch an 84 MB neural
codec from a CDN allow-listed in the policy. The host that actually serves those weights was not on
the list, so the fetch was blocked; and because one handler covered both decryption and playback, a
listener holding the **correct** key was told the key was wrong. Two rules came out of it. Never
allow-list somebody else's CDN — host what you depend on, or design the dependency away. And never
let a decryption failure and a playback failure share a `catch`, because getting past `unseal()` is
proof the key was right: AES-GCM authenticates before it returns a single byte.

## Conventions

British English throughout. All work is Prayas Abhinav's.
