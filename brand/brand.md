# Zariia — brand

*Made 25 July 2026, revised 26 July. In Prayas's visual language (the `frontend-design-prayas`
signature). Zariia is a standalone identity — it carries no Koher braid, no Q/R/L, no Fraunces.
Its mark, chord, and type are its own.*

*This document, `palette.css` and `../website/zariia.css` are in sync as of 26 July 2026, 10:30.
If you change one, change all three.*

Assets in this folder:

| File | What it is |
|---|---|
| `zariia-symbol.svg` | the mark alone — square, favicon-ready |
| `zariia-logo.svg` / `.png` | unified symbol + wordmark. Self-contained: vector key + the wordmark as an embedded raster (NOT outlined), so it renders without a font. Use the PNG for universal viewing. |
| `palette.css` | the chord + type + motion as CSS variables |
| `brand.html` | the rendered brand sheet — look at this |
| `brand.md` | this document |

---

## The idea the mark carries

Zariia releases music with a sealed second channel, unlocked by a key: the released
track plays for anyone and sounds whole; the key unlocks a second channel that plays in
sync for the complete work. The name is the Flaming Lips' four-disc album meant to play on
four machines at once — chaos welded to discovery, a symphony assembled from many
machines.

The symbol holds the three central concepts in one mark: **the key, the music, and the keyed
truth.** Its **bow is a ring holding a lit aperture** (warm light through an opening — the keyed
truth, revealed; the key *is* the opening, not a lock and not a padlock). Its **bit is a
waveform** — the music, a sound wave, not equaliser bars.

**Revised 26 July 2026 — elegant, stable, deep, sober.** The key is now drawn as a **fine line**
rather than a gold mass, and it **stands on a ground line rather than floating**; the ground line
is where the stability comes from. Its field is a **fired-clay** ground, deep and vignetted so the
dark has distance in it instead of sitting flat. One warm light, held — no bloom filter, no neon,
no scattered stars. *(The first revision used a heavy gold key with a blurred glow layer. It read
as candy at small sizes and was retired.)*

**A trap in the file, recorded so nobody re-introduces it.** The shank is a vertical `<line>`,
whose object bounding box has zero width — an `objectBoundingBox` gradient on its stroke therefore
degenerates and **the shank vanishes silently**, leaving a mark that reads as a lamp rather than a
key. `zariia-symbol.svg` uses `gradientUnits="userSpaceOnUse"` for exactly this reason. Do not
change it back.

The tagline — **"Open music · keyed truths"** — carries the same three: the music plays in
the open; the truth is *keyed* (a musical key, and a key that unlocks it). The literal
honest line ("presence open, content keyed") lives in the usage rules below, where it
belongs — the tagline evokes, the boundary states.

## The chord

**Revised 26 July 2026 — the body is FIRED EARTHENWARE, not indigo night.**

The identity draws on four sources Prayas named — Moroccan zellij and pierced lanterns, Kutchi
earthenware, Greek pottery, the matryoshka — which are one idea rather than four: they are all
**vessels carrying banded decoration**, and each of them either opens or lets light through. The
chord moved with that. A black-slip and fired-clay body, terracotta arriving as a mass, bone slip
as the painted line, struck gold as the light, and a Moroccan blue-teal as the cold counter-voice.

**The meanings are unchanged.** Gold is the open song. Terracotta is the sealed channel alight.
Teal is the cold latent state. What changed is which colour is the *body* and which are the marks
laid on it — terracotta is now the body, not an accent.

| Role | Hex | Note |
|---|---|---|
| Clay body (ground top) | `#2e170e` | fired clay; the vessel itself |
| Fired dark (ground mid) | `#150c07` | the page's base |
| Black slip (ground base) | `#0d0705` | deepest; never `#000` |
| The open song (lead) | `#e0ae5c` / high `#f2d79c` | struck gold — light held, not switched on |
| The sealed channel, alight | `#b4522a` / hot `#d4703c` | terracotta — arrives as a MASS, never a line |
| Terracotta deep | `#7a3218` | the shadowed side of the mass |
| The cold counter-voice | `#1c5a6e` / high `#3d93a6` | zellij blue-teal; machinery and labels |
| Sealed-but-locked contour | `#264a5a` | cold; the *latent* state of the second channel |
| Bone slip / text | `#eadfcb` / dim `#a3947a` | the painted line on the pot; never sRGB white |

Complementary clash is still deliberate — warm clay and gold set against zellij teal — but the
26 July direction is **sober**: colour glows rather than flares, and nothing pulses.

### The ornaments

Three, and each does a job rather than decorating:

- **The meander** (Greek key) rules the horizontal **registers** apart, as on a pot. It is
  ornament and namesake at once, and needs no explaining. Keep it a *rule*, never a band: inset,
  masked to a fade, low opacity. It shipped once full-bleed and loud, and read as a shouting
  stripe.
- **The zellij eight-point star** is the section marker and the list bullet.
- **The pierced screen** is how light arrives — scattered points, as through a lantern, not a
  wash. Irregular, wide pitch, very low opacity.

**Nesting is the structural device.** Sealed matter is drawn as a frame inside a frame inside a
frame, the innermost unlit — matryoshka. One thing inside another is what a Zariia release *is*,
so sealed content is never a flat panel.

## Type

A two-voice split by typeface, display against machinery:

- **Display:** **Antic Didone** — a fine-stroked didone. Thin by stroke *contrast* rather than by
  a weight axis, which is why it stays warm where a hairline sans goes cold. The wordmark,
  headings, big statements. Set with air around it and a little positive tracking (the lockup
  uses +0.03em); it does not need to be loud, because the mark already is.
  *(Replaced BhuTuka Expanded One 25 Jul — too broad; then Yatra One 26 Jul — too brushy.
  Prayas asked for thin, and thin is now the position: the mark carries the weight, the word
  stays quiet beside it.)*
- **Machinery:** **Cutive Mono** — typewritten. Labels, the key field, the honest-boundary
  lines, anything functional.

Never geometric sans (Inter/Roboto/system) — including the *thin* geometric sans, Poppins /
Jost / Montserrat / Josefin, which is what "thin font" usually means everywhere else and is
exactly what this is not. Never Fraunces (that is Koher's face).

**A consequence of going thin, worth holding.** Hairline strokes lose a gradient against a
glowing ground — the fill washes out and the word goes muddy. So the wordmark takes the gold
gradient only at lockup size, where the strokes are thick enough to carry it; anywhere small
or on a lit field, set it flat in `--gold-hi` (`#f2d79c`). This is a legibility rule, not
a taste one.

The specimen sheets that produced this decision are kept in this folder —
`wordmark-specimens.png` (heavy, all declined) and `wordmark-specimens-thin.png` (thin, the
chosen direction), with their HTML sources so either can be regenerated or extended.

## Motion

Organic, slow, light- and gravity-driven. The sealed channel *rises into light* on unlock — an
ignition from the warm root upward, the paint-drip signature inverted. No snappy mechanical
micro-interactions.

**Revised 26 July 2026: almost nothing moves.** The earlier breathing glows and drifting washes
were retired — a thing that pulses cannot be sober. What remains is one very slow ground settle,
the unlock rise, and reveals that arrive as a settle rather than a pop. Motion is the exception
now, not the surface.

## Usage — and the lines the brand must never cross

The brand voice is bound, not free:

- **Presence open, content keyed.** Say plainly what the object is: an openly-present sealed
  channel whose *content* is protected by a key. The tagline in the lockup states exactly
  this. Never let copy or imagery imply the object hides, evades, or defeats anyone —
  covertness would be false, and it is not what the object is.
- **No authority markers, ever.** No badges, ticks, verification marks,
  "official" styling, or anything that could make a claim look endorsed. Even the label
  signature, which does prove origin, is reported as a plain sentence. The mark is a small
  painting, not a seal.
- **No Koher elements.** Zariia has its own identity. Do not import the braid, the Koher
  wordmark, or Q/R/L.
- **The music is real and avowable.** The register is a music label / venue — authored, joyful,
  scene-based — not a security product. Warmth, not secrecy, is the tone.

Do not recolour the mark to an unrelated palette, flatten its field into a solid fill (the medium
must show through — the vignette is what gives the dark depth), or set the wordmark in a geometric
sans. The mark's container and scale may adapt; its character does not.

**One identity per screen.** On the home page the masthead carries mark and wordmark, so the
navigation carries links only. On every other page the navigation carries the lockup, because
there it is the way back. Never both at once — that was a real error, caught on 26 July: the name
and the mark each appeared twice above the fold.
