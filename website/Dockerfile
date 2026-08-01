# Zariia — the website. Static files on nginx; no build step, no runtime.
FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf headers.conf /etc/nginx/conf.d/

COPY index.html buffer.html not-knowing.html the-object.html the-name.html historicising.html releases.html player.html curatorial.html artists.html residencies.html credits.html contact.html \
     zariia.css fonts.css zariia-symbol.svg og.png \
     favicon.ico favicon-source.svg favicon-32.png apple-touch-icon.png icon-512.png \
     site.webmanifest /usr/share/nginx/html/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY lib/   /usr/share/nginx/html/lib/
# 🔴 img/ was added to make-caprover-tar.sh on 27 July 2026 and NOT here, so the
# first deploy of the photographs shipped a tarball that contained every image and
# an nginx image that contained none — a broken <img> on all nine pages, and a
# green "Deployed successfully". Staging a file is not serving it. Any new directory
# needs BOTH lists, and the only proof is `curl -sI https://zariia.org/<file>`.
# 🔴 28 July 2026: it happened again in the FILE-shaped variant. artists.html was
# added to REQUIRED_FILES in make-caprover-tar.sh and not to the COPY line above, so
# the deploy shipped a tarball containing the page, built an image without it, and
# reported success — /artists returned 404 while the nav link to it was live on all
# nine other pages. The rule is not "any new directory". It is ANY NEW FILE OR
# DIRECTORY needs BOTH lists.
# 🔴 29 July 2026: a THIRD instance, directory-shaped again. demo/ was added to
# make-caprover-tar.sh — with a guard verifying the record carried a sealed channel —
# and not to this file. The tarball contained the demo, the image did not, the deploy
# reported success, and the player page offered a "Load the demo record" button that
# returned 404. The tarball guard could never have caught it: it inspects the tarball,
# which was correct. make-caprover-tar.sh now cross-checks this file against its own
# lists, which is the check that would have caught all three.
COPY img/   /usr/share/nginx/html/img/
COPY demo/  /usr/share/nginx/html/demo/
COPY print/ /usr/share/nginx/html/print/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/health || exit 1
