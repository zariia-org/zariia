# Deploying the Zariia website — CapRover (blevn)

Static nginx. No build step, no runtime, no database, nothing to configure after the first deploy.

```bash
cd ~/Dropbox/personal_projects/zariia/website
caprover deploy -n blevn -a zariia
```

`caprover` needs Node 20 for its api commands:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 20
```

---

## 🔴 HTTPS is mandatory, not a nicety

**The player will not work over plain HTTP.** It decrypts in the browser using
`crypto.subtle` (Web Crypto), which browsers expose **only in a secure context**. Over
`http://` the module throws at import time and the page looks broken for reasons that have
nothing to do with the code.

So in the CapRover panel for the app: **enable HTTPS, and turn on "Force HTTPS by
redirecting all HTTP traffic"**. Do this before showing anyone the player.

## After the first deploy

1. **Connect the domain.** `zariia.org` is registered at Cloudflare Registrar on the
   me@prayas.in account. Point it at blevn, then enable HTTPS in CapRover as above.
2. **Turn on auto-renew** for the domain itself. A lapsed registration is a more realistic
   way to lose this than anything else, and the `.com` has been sat on since 2019 — the
   string is watched.
3. Check `/health` returns `ok`, and that `curl -sI https://…/lib/zariia-crypto.mjs`
   reports `content-type: application/javascript`.

## What the container does, and the two things that matter

| Concern | How it is handled |
|---|---|
| **`.mjs` MIME type** | Set explicitly in `nginx.conf`. nginx's bundled `mime.types` does not map `.mjs` in every version, and if it arrives as octet-stream the browser refuses to execute it — the player then fails with a module error that looks like a code bug and is not one. |
| **Caching** | HTML `no-cache` so a redeploy is visible at once; fonts and the mark immutable for a year; CSS and JS a week. |
| **Headers** | `nosniff`, `DENY` framing, `no-referrer`, a Permissions-Policy switching off geolocation/camera/microphone, and a CSP that is same-origin apart from one declared exception. |
| **Pretty URLs** | `/the-name` resolves to `the-name.html` without a redirect. |
| **gzip** | On for text; deliberately **not** applied to `woff2`, which is already compressed. |

### The CSP is strictly same-origin, and stays that way

There is no third-party origin in the policy. `make-caprover-tar.sh` fails the build if one
reappears in `headers.conf` or any page.

**This used to be an exception, and the exception was broken the whole time.** The policy
allowed `cdn.jsdelivr.net` and three huggingface hosts so the player could fetch an 84 MB
Mimi decoder. Hugging Face serves model weights from `us.aws.cdn.hf.co`, which was not on
the list, so the fetch was blocked — and because the player caught every post-decryption
failure in one handler, the page told a keyholder holding the **correct** key that the key
was wrong. Found on 29 July 2026 by driving the live player with a real sealed file, and
confirmed by re-running with CSP bypassed, where the identical file opened.

Two things follow, and both are now enforced rather than noted. An allow-list of someone
else's CDN hostnames is a guess that expires silently. And a decryption failure and a
playback failure must never share a handler, because the seal opening is *proof* the key
was right: AES-GCM authenticates, so a wrong key cannot get past `unseal()`.

Sealed channels are Opus, FLAC or WAV — formats the browser already decodes. Nothing to
fetch, nothing to allow. If the neural codec ever returns it gets bundled locally.

## Weight

A first visit costs about **36 KB** — roughly 10 KB of gzipped HTML/CSS/SVG and 26 KB of
webfont. Every subsequent page is about 4 KB, because the fonts and stylesheet are cached.

**There are no third-party requests at all.** The two webfonts are self-hosted in `fonts/`
(pulled from Google Fonts on 26 July 2026, both SIL OFL). That was done deliberately: it
removes an origin that can be blocked, removes a third party that would see every visitor's
IP, and lets the site render with the network down. The footer claims no trackers, no
analytics, no cookies — this is what keeps that claim true rather than aspirational.

## Not verified here

The Docker build was **not** run locally — the daemon was not available at the time of
writing, so the image has never been built. It is a five-line `nginx:alpine` copy with no
build stage, but treat the first CapRover build as the first real test, and check the two
`curl` assertions above rather than assuming.
