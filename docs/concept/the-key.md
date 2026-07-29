# How the key is distributed

*Drafted 26 July 2026, answering the open question in `zariia.md`. Recommendation and reasoning;
the decision is Prayas's.*

---

## What exists already

The carrier issues a **32-byte symmetric key per drop**, in two interchangeable forms: a
**24-word BIP39 mnemonic** (checksummed, so a mistyped word is caught rather than silently
failing) and 64 hex characters. The player will also accept a **passphrase**, deriving a key
through PBKDF2-HMAC-SHA-256 at 600,000 iterations.

So the mechanism exists. What is undecided is the social model it serves, and the three candidates
are not equivalent.

## The three models

### A. One scene key

Everyone in the scene holds the same key; every release opens with it.

Attractive because the social act is clean: you are given the key once, and you are in. It also
matches how people imagine a subculture works.

**It fails on two counts, and both are fatal at any real size.** There is no revocation — one leak
opens the entire back catalogue, permanently and retroactively, including releases made before the
leaker arrived. And a shared secret held by a few hundred people is not a secret; it has simply not
been published yet. It also concentrates value: a single key worth stealing, worth coercing
someone for, and on a seized phone it opens everything at once.

### B. Per-drop keys, passed by people

Each release has its own key. Keys travel person to person.

Compartmentalised: a leak costs one record, and the loss is bounded and knowable. Requires no
directory, no server, no accounts — consistent with *operate nothing* and *store nothing*.

The apparent drawback is that distribution repeats for every release. **That is the feature, not
the cost.** A scene is not maintained by a one-time initiation; it is maintained by continuing to
be handed things. Cassette culture worked this way — nobody joined, people kept being given tapes,
and the repetition is what kept anyone in contact. A key that must be passed again each time keeps
the relationship alive; a key given once lets it go dormant while the person still holds access.

Note the limit of that analogy, corrected 27 July 2026: the repeated giving is **evidence of a live
relation, not the thing that constitutes one** (`zariia.md`, amendment of the same date). Access is
not membership. What per-drop keys buy is that the relation has to still be there each time for the
next key to travel — which is a real property, and a more modest one than initiation.

### C. Public-key, encrypted to each member

Every member has a keypair; a release is encrypted to the set of member public keys. Newcomers can
be admitted without a pre-shared secret, and revocation is possible by omitting a key next time.

**This is the trap, and it should be rejected explicitly rather than left as an option.** It solves
admission and revocation by creating **a list of who is in the scene** — the single most dangerous
artefact this project could produce. A membership roster is a social graph by another name; it
contradicts *store nothing*, it contradicts the refusal to keep a proximity graph, and it names
every participant on any device or server where it sits. It would also publish the size of the
scene in the file itself, since the wrapped-key block grows with membership.

A project that keeps nothing should not build a register of its own people in order to make
admission tidier.

## What is actually implemented, traced 26 July 2026

Not the same as what is recommended, and the difference matters.

| Property | Status | Traced to |
|---|---|---|
| Symmetric, full-entropy | **yes** | AES-256-GCM, RAW mode; `generateKey()` = `getRandomValues(32)` |
| Passed by people | **yes** | `keyToMnemonic()`; the player's "show the key, to pass on" |
| Nothing stored | **yes** | no `localStorage` / `sessionStorage` / `indexedDB` / cookie anywhere in the player or library — grepped, not assumed |
| Carries no identity | **yes, structurally** | the bundle header is magic + version + entry count, then type/codec/length/bytes. There is no field for an author, a drop id, a timestamp or a key id |
| **Per-drop** | **DEFAULT ONLY — not enforced** | `--genkey` mints a fresh key; `--key`/`--words` reuses one across drops, and the packer's own comment names that "a scene key" |

**So the model recommended against below is one command-line flag away.** Nothing prevents a scene
key; the packer offers it. If per-drop is the decision, it needs to become a property of the tool
rather than a habit of whoever runs it — otherwise the first person in a hurry reuses a key and
the whole back catalogue quietly shares a secret.

Two caveats on "no identity", for accuracy. A `NOTE` entry is free-form, so identity can be written
into *content* even though the structure carries none. And the FLAC block advertises `ZRKA` as its
application id — that identifies the **format**, not the person, which is what *presence open*
means and is intended.

## The recommendation

**Per-drop symmetric keys, distributed by people, with the key carrying no identity.** Model B.

The key should say nothing about who issued it or who holds it — it is 32 bytes and a set of words,
and two copies of it are indistinguishable. That means a key found on a phone implicates nobody but
the phone, and it means a keyholder can pass it on without the act being traceable back through
the object.

### The sessions are the distribution event

This is where the recording-sessions decision pays off in a way that was not the reason for making
it. If releases come out of sessions that musicians and bands are invited to, then **the people in
that room are the first keyholders**, and the key does not need a distribution mechanism at all for
its first hop — it is spoken, written on a card, or printed on whatever physical thing the session
produces. The occasion that makes the record is the occasion that seeds its key.

From there it moves the way anything moves in a scene: because someone tells someone.

## Three engineering changes worth making

**0. ✅ DONE — per-drop is now enforced, not default.** `--key`/`--words` requires
`--reuse-key-scene-wide`, and `--passphrase` requires `--unsafe-passphrase`. Both **exit 2** rather
than warning — verified, because a guard that only reports is not a guard. A property that holds
only while nobody passes a flag was a property of the operator's attention, not of the system.


**1. Twelve words, not twenty-four.** Twenty-four words carries 256 bits, which is a Bitcoin
convention inherited for reasons that do not apply here — it exists because a wallet seed guards
irreversible money forever. A Zariia key guards one record. **Twelve words is 128 bits**, which is
beyond any brute-force horizon that matters, and it is *dramatically* more passable: sayable across
a table, writable on a card, rememberable for the length of an evening. Halving the length roughly
doubles the chance the key actually travels, and travelling is the whole point.

**2. Do not offer passphrase mode for public releases.** The code already carries the caution and
it should be promoted to a rule. A released file is *in the wild*, so an attacker has the
ciphertext and unlimited offline attempts. PBKDF2 at 600,000 iterations multiplies the cost of each
guess; it does not change the fact that a human-chosen passphrase carries perhaps 30–40 bits, which
is exhaustible. There is no interactive protocol available to a file sitting on a stranger's disk, so the only
defence is that the key was never guessable. Keep passphrase mode for local experiments if
useful; never ship a release keyed by one.

## Architectural gaps found on tracing the code — ✅ CLOSED 26 July 2026

Two were real holes rather than trade-offs, and neither was mentioned anywhere in the project's
documents. **Both are now fixed, with tests that fail if the fix is removed** (`npm test`, 14
assertions). The analysis is kept below because the reasoning is the point, not the patch.

### 1. ✅ FIXED — the open track was NOT bound to the sealed channel

`seal()` calls AES-GCM with **no `additionalData`**. The sealed blob is therefore cryptographically
independent of the audio it rides beside. Anyone can lift release A's sealed block, staple it onto
release B's audio — or onto any FLAC at all — and it decrypts perfectly with A's key.

So "the complete work" is not a thing the file can attest. The pairing of open track and second
channel is a convention of how the file was assembled, not a property anything checks.

**Fixed as follows.** A hash of the open audio frames is passed as AAD to `seal()` / `unseal()`.
GCM takes additional authenticated data natively — one parameter on each call. A swapped pairing
then fails to open, loudly, instead of playing something that was never meant to go together.

### 2. ✅ FIXED (mechanism) — there was no authenticity at all, only confidentiality

Grepped the whole carrier: **no signing anywhere.** No Ed25519, no ECDSA, no signature of any kind.

AES-GCM authenticates that the ciphertext was not tampered with **given the key**. It says nothing
about who made the file. So anybody can build a FLAC carrying the `ZRKA` application id, seal
whatever they like with a key of their choosing, hand that key around, and it is indistinguishable
from a Zariia release. The player will open it and play it.

**Why this matters here.** A forged release is a way to put something into the scene that the scene
will trust — and the sealed channel is a good place to put something a listener would not want to
be found holding. Nothing currently lets anyone tell.

**Fixed as follows.** `zariia-sign.mjs` signs `audioDigest ‖ sealedBlob` with a **single label
key** (ECDSA P-256 — universal WebCrypto support, where Ed25519 is still uneven in browsers). The
signature rides in a `ZRKS` APPLICATION block **outside** the encryption, so origin is checkable by
anyone holding the file, with or without the sealed key. Tests cover: verifies; fails on a swapped
track; fails for a forger with a different key; survives the FLAC round-trip; an unsigned file
reports no origin.

**Still to decide (the mechanism exists, the policy does not):** no label keypair has been
generated, and no public key is published or pinned. Until one is, the player reports only that a
signature is *present*. Generate the keypair with `generateLabelKeypair()`, keep the private JWK
off the repo, and publish the public one.

**The tension to hold, not resolve.** The brand forbids authority markers — no badges, no ticks,
nothing that dresses a claim in authority. A "verified" tick is precisely that. But note the
distinction: this is **provenance of an artefact the label itself made**, closer to a maker's mark
than to a verification badge. And crucially, **one published label public key is not a membership
list.** It names the label, not the scene — the whole difference between this and the public-key
model rejected above.

Prayas should decide whether that distinction holds. If it does not, the honest alternative is to
say plainly on the site that a Zariia file's origin cannot be verified — true today, and unsaid.

### 3. Smaller things

- **The key is a bearer token with exactly one capability.** Whoever can listen can redistribute;
  there is no way to grant hearing without also granting the power to grant hearing. Inherent to
  symmetric keys, not fixable, worth stating.
- **No revocation, ever.** A released key opens that record permanently. Also inherent.
- **The key mode travels in clear** in the `ZRK1` header, so an observer can see which files are
  passphrase-keyed — i.e. which ones are worth attacking offline. A small leak that points an
  attacker at the weak files.
- **RAW mode writes an all-zero 16-byte salt** into the header, unused. Harmless, but it is dead
  structure that invites someone to think it means something.

## The honest boundary

**Zariia's confidentiality is cryptographic in the file and social in the channel.** The sealing is
sound. The distribution is people telling people, and it inherits every weakness of whatever
channel they use — a key sent over WhatsApp is as exposed as WhatsApp, and the metadata of that
message shows who told whom even if the words are protected.

This is not a flaw to engineer away; there is no way to hand someone a secret at a distance without
a channel. It is a boundary to state, in the same register as everything else here: *the content is
only ever as safe as the key and who holds it*, and now we know precisely what that sentence costs.

## Still open

- **Whether a release should ever be re-keyed** after a known leak. Re-keying means reissuing the
  file, and copies already in circulation stay open — so it may be honest to say that a leaked
  release is simply open now, and let the next one be the boundary.
- **Whether keys are ever published deliberately** — a record opened to everyone after a year, say.
  That would make the sealed channel a delay rather than a gate, which is a different offer and
  possibly a warmer one.
- **What a keyholder is told about passing it on.** The player already offers to show the key so it
  can be handed onward. Whether that carries any guidance, and what it says, is unwritten.
