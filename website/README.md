# Zariia — website

Static, six pages, no build step. Open `index.html` in a browser, or serve the folder.

| File | What it is |
|---|---|
| `index.html` | the label — masthead, what it is, the five rooms, the key, the pretext |
| `the-object.html` | how one file carries two channels, the three states, the honest boundaries |
| `the-name.html` | public version of `docs/concept/the-name.md` |
| `historicising.html` | public version of `docs/concept/historicising.md` |
| `releases.html` | the catalogue, honestly empty |
| `player.html` | the working player — drop a file, unlock with a key |
| `zariia.css` | the shared page language |
| `fonts.css` + `fonts/` | **self-hosted** Antic Didone + Cutive Mono (SIL OFL) |
| `zariia-symbol.svg` | the mark — favicon and nav/masthead lockup |
| `og.png` + `og-source.html` | the social preview card, and the HTML it renders from |
| `lib/` | browser-safe carrier modules, copied from `../carrier/src/` |
| `Dockerfile`, `nginx.conf`, `headers.conf`, `captain-definition` | the CapRover deployment |
| `make-caprover-tar.sh` | builds `zariia.tar` — refuses to build an incomplete one |
| `DEPLOY.md` | **read before deploying** — HTTPS is mandatory, not optional |

## The design

Made with the `frontend-design-prayas` signature. The primary device is **the lit aperture**:
the page is a dark room, and everything readable arrives through an opening of warm light burned
into the ground. Sealed matter sits *outside* the light, drawn as a cold contour — present,
visible, unlit. That is `presence open, content keyed` made compositional rather than diagrammed.

Chord and type are Zariia's own (`../brand/brand.md`): indigo-cobalt night rooted in warm ember,
gold as the open song, vermilion as the sealed channel alight, teal as the cold latent state;
**Antic Didone** for display *and running prose*, **Cutive Mono** for machinery only — labels, the
key field, colophon.

**No Koher elements.** No braid, no Q/R/L, no Fraunces. The family resemblance is the shared hand —
painterly dark ground, colour as mass, asymmetry, active void, grain, the two-voice type split —
not shared marks. This is deliberate: `../CLAUDE.md` keeps Zariia standalone so a notice attaches
here rather than to Koher.

## Deploying

```
./make-caprover-tar.sh
caprover deploy -n blevn -a zariia -t zariia.tar
```

Then enable HTTPS **and** force-redirect in the CapRover panel. This is not a preference: the
player decrypts with `crypto.subtle`, which browsers expose only in a secure context, so over
plain HTTP the page looks broken for reasons unrelated to the code. Full notes in `DEPLOY.md`.

## Two things to know before changing anything

**The player runs from `lib/`, not from `../carrier/src/`.** The six browser-safe modules are
copied so the site deploys standalone. If the carrier's crypto or bundle format changes, re-copy:

```
cp ../carrier/src/{bip39-wordlist,mimi-codec,zariia-bundle,zariia-crypto,zariia-flac,zariia-key}.mjs lib/
```

**The player needs to be served over http(s), not opened as `file://`** — it uses ES modules.
Any static server will do.

## What must not drift

- **No authority markers.** No badges, ticks, verification marks, or institutional styling
  anywhere on this site.
- **Never describe the object as hiding, evading, or defeating anyone.** The sealed channel's
  presence is open by design; only the content is keyed. The copy on every page is written to that
  line and it is a legal position, not a stylistic one.
- **The releases page says nothing is released.** It stays that way until something is.
- **No trackers, no analytics, no cookies.** Stated in the footer, so it has to remain true.

## Not yet done

- Neither essay page has been through `de-ai-cold-read`. Both must be, before the site is public.
- **Regenerate `og.png`** if the mark or wordmark changes:
  `chrome --headless --screenshot=og.png --window-size=1200,630 og-source.html`
- The neural-codec path in the player fetches a decoder from a public CDN on first use. That is
  the one moment a page reaches outside itself, and it is disclosed on the player page.
