/**
 * audit.mjs — site-wide render audit for zariia.org
 *
 * 🔴 THIS IS A GUARD, NOT A REPORT. It exits non-zero when it finds anything
 * unresolved, and `make-caprover-tar.sh` refuses to build on that exit code.
 * A checker that only prints enforces nothing. That lesson was paid for
 * elsewhere in this project, and it is why the exit code exists.
 *
 * It drives a real browser because every fault it looks for is invisible to
 * grep and to a code read. The clipped label found on 31 July 2026 had been
 * live since the figure was drawn: SVG simply stops painting at the viewBox
 * edge, with no error, no warning and no failing test.
 *
 * WHAT IT CHECKS
 *   svg-clip        a <text> whose box crosses its viewBox — silently cut off
 *   svg-collide     two <text> boxes overlapping — labels printed over labels
 *   svg-noviewbox   an <svg> with no viewBox, so it cannot scale predictably
 *   svg-unnamed     a figure with no <title> and no aria-label
 *   text-too-small  rendered size under the floor. For SVG this is the
 *                   EFFECTIVE size (font-size x viewBox scale), which is the
 *                   number that actually reaches an eye and is not the number
 *                   written in the CSS
 *   low-contrast    text measuring under the ratio floor against its ground
 *
 * THE QUEUE
 *   Every finding gets a stable id. An id listed in audit-accepted.json with a
 *   reason and a date is reported as accepted and does not fail the build.
 *   Anything else fails it. Nothing is silently dropped: accepted findings are
 *   printed on every run, so an accept-list that has grown is visible.
 *
 * USAGE
 *   node audit.mjs           audit, exit 1 on unresolved findings
 *   node audit.mjs --json    machine-readable, same exit code
 *   node audit.mjs --accept  print the JSON to paste into audit-accepted.json
 */

import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = new URL('.', import.meta.url).pathname;
const PORT = 8791;

/* Thresholds. Tuned to this site rather than to a standard, and the reasons
   are recorded so a later change is a decision instead of a drift. */
const MIN_SVG_PX = 9.5;   // zariia.css: below this Cutive Mono stops holding together
const MIN_HTML_PX = 11;   // the smallest deliberate size on the site is the 11.5px label
const MIN_CONTRAST = 3.0; // the --latent teal measured ~2:1 and was invisible (27 Jul 2026)
const VIEWPORTS = [{ w: 1920, h: 1080, name: 'wide' }, { w: 760, h: 1080, name: 'narrow' }];
const SKIP_PAGES = new Set(['og-source.html']);

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.json': 'application/json', '.flac': 'audio/flac' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(HERE, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => server.listen(PORT, () => r(server)));
}

async function loadPuppeteer() {
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return (await import(join(root, 'puppeteer', 'lib', 'esm', 'puppeteer', 'puppeteer.js'))).default;
}

/* Runs inside the page. Everything here needs real layout, which is the whole
   reason this is a browser and not a parser. */
function collect(cfg) {
  const out = [];
  const near = n => Math.round(n * 10) / 10;

  const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = s => { const m = (s || '').match(/[\d.]+/g); return m ? m.slice(0, 4).map(Number) : null; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  /* Walk up for the first painted background. Returns null when everything is
     transparent or a gradient/image, which the caller reports as unknown
     rather than guessing — a guessed pass is worse than an admitted gap. */
  function ground(el) {
    for (let n = el; n && n !== document.documentElement.parentNode; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parse(cs.backgroundColor);
      if (bg && (bg[3] === undefined || bg[3] > 0.92)) return bg.slice(0, 3);
    }
    return null;
  }

  for (const svg of document.querySelectorAll('svg')) {
    if (svg.classList.contains('grain')) continue;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) continue;
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);

    const fig = svg.closest('figure');
    if (fig) {
      const named = svg.querySelector('title') || svg.getAttribute('aria-label') || fig.getAttribute('aria-label');
      if (!named) out.push({ check: 'svg-unnamed', detail: 'figure svg has no <title> and no aria-label', key: fig.className || 'figure' });
    }

    if (vb.length !== 4 || !vb[2]) {
      if (svg.querySelector('text')) out.push({ check: 'svg-noviewbox', detail: 'svg with text has no usable viewBox', key: svg.getAttribute('role') || 'svg' });
      continue;
    }

    const scale = rect.width / vb[2];
    const texts = [...svg.querySelectorAll('text')];
    const boxes = [];

    for (const t of texts) {
      const label = t.textContent.trim();
      if (!label) continue;
      const r = t.getBoundingClientRect();
      const x0 = (r.left - rect.left) / scale, x1 = (r.right - rect.left) / scale;
      const y0 = (r.top - rect.top) / scale, y1 = (r.bottom - rect.top) / scale;
      boxes.push({ label, x0, x1, y0, y1 });

      if (x1 > vb[2] + 1 || x0 < vb[0] - 1 || y1 > vb[3] + 1 || y0 < vb[1] - 1) {
        out.push({ check: 'svg-clip', key: label,
          detail: `"${label}" spans x ${near(x0)}–${near(x1)}, y ${near(y0)}–${near(y1)} in a ${vb[2]}x${vb[3]} viewBox` });
      }

      const px = parseFloat(getComputedStyle(t).fontSize) * scale;
      if (px < cfg.minSvgPx) {
        out.push({ check: 'text-too-small', key: label, value: near(px),
          detail: `"${label}" renders at ${near(px)}px (floor ${cfg.minSvgPx}px)` });
      }

      const fill = parse(getComputedStyle(t).fill);
      const bg = ground(svg);
      if (fill && bg) {
        const cr = ratio(fill.slice(0, 3), bg);
        if (cr < cfg.minContrast) {
          out.push({ check: 'low-contrast', key: label, value: near(cr),
            detail: `"${label}" measures ${near(cr)}:1 against its ground (floor ${cfg.minContrast}:1)` });
        }
      }
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox > 1 && oy > 1) {
          out.push({ check: 'svg-collide', key: `${a.label}|${b.label}`,
            detail: `"${a.label}" overlaps "${b.label}" by ${near(ox)}x${near(oy)} units` });
        }
      }
    }
  }

  for (const el of document.querySelectorAll('p,li,h1,h2,h3,h4,a,span,figcaption,cite,td,th')) {
    const text = (el.textContent || '').trim();
    if (!text || el.children.length) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    if (px < cfg.minHtmlPx) {
      out.push({ check: 'text-too-small', key: text.slice(0, 40), value: near(px),
        detail: `"${text.slice(0, 40)}" renders at ${near(px)}px (floor ${cfg.minHtmlPx}px)` });
    }
    const fg = parse(cs.color), bg = ground(el);
    if (fg && bg) {
      const cr = ratio(fg.slice(0, 3), bg);
      if (cr < cfg.minContrast) {
        out.push({ check: 'low-contrast', key: text.slice(0, 40), value: near(cr),
          detail: `"${text.slice(0, 40)}" measures ${near(cr)}:1 against its ground (floor ${cfg.minContrast}:1)` });
      }
    }
  }
  return out;
}

const id = f => createHash('sha1').update(`${f.page}|${f.check}|${f.key}`).digest('hex').slice(0, 10);

const run = async () => {
  const args = process.argv.slice(2);
  const server = await serve();
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  const pages = (await readdir(HERE)).filter(f => f.endsWith('.html') && !SKIP_PAGES.has(f)).sort();
  const cfg = { minSvgPx: MIN_SVG_PX, minHtmlPx: MIN_HTML_PX, minContrast: MIN_CONTRAST };
  const findings = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h });
    for (const file of pages) {
      await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      for (const f of await page.evaluate(collect, cfg)) findings.push({ ...f, page: file, viewport: vp.name });
    }
    await page.close();
  }
  await browser.close();
  server.close();

  /* Same fault at both viewports is one fault. */
  const seen = new Map();
  for (const f of findings) {
    const k = id(f);
    if (seen.has(k)) seen.get(k).viewports.push(f.viewport);
    else seen.set(k, { id: k, ...f, viewports: [f.viewport] });
  }
  const all = [...seen.values()];

  const acceptFile = join(HERE, 'audit-accepted.json');
  const accepted = existsSync(acceptFile) ? JSON.parse(readFileSync(acceptFile, 'utf8')) : [];
  const acceptedById = new Map(accepted.filter(a => a.id).map(a => [a.id, a]));
  const classAccepts = accepted.filter(a => a.scope === 'class');

  /* A class accept covers a whole family — but it must declare a bound, and
     anything past that bound still fails. An unbounded class accept would be
     an off switch wearing the costume of a decision. */
  const coveringClass = f => classAccepts.find(a =>
    a.check === f.check &&
    (!a.page || a.page === f.page) &&
    (!a.viewport || f.viewports.includes(a.viewport)) &&
    (a.floor === undefined || (typeof f.value === 'number' && f.value >= a.floor)));

  const reasonFor = f => acceptedById.get(f.id)?.reason ?? coveringClass(f)?.reason;
  const open = all.filter(f => !reasonFor(f));
  const known = all.filter(f => reasonFor(f));
  const stale = accepted.filter(a => a.id && !seen.has(a.id));

  if (args.includes('--json')) {
    console.log(JSON.stringify({ open, accepted: known, stale }, null, 2));
  } else if (args.includes('--accept')) {
    console.log(JSON.stringify(open.map(f => ({ id: f.id, page: f.page, check: f.check,
      note: f.detail, reason: 'FILL THIS IN', accepted: new Date().toISOString().slice(0, 10) })), null, 2));
  } else {
    console.log(`\naudit — ${pages.length} pages x ${VIEWPORTS.length} viewports\n`);
    if (known.length) {
      console.log(`accepted (${known.length}), listed so the list stays visible:`);
      const byReason = new Map();
      for (const f of known) {
        const r = reasonFor(f);
        if (!byReason.has(r)) byReason.set(r, []);
        byReason.get(r).push(f);
      }
      for (const [reason, list] of byReason) {
        console.log(`  · ${list.length} x ${[...new Set(list.map(f => f.check))].join(', ')} — ${reason}`);
        if (list.length <= 3) for (const f of list) console.log(`      ${f.page}: ${f.detail}`);
      }
      console.log('');
    }
    if (stale.length) {
      console.log(`stale accept entries (${stale.length}) — fixed or gone, delete them:`);
      for (const a of stale) console.log(`  · ${a.id} ${a.page || ''} ${a.check || ''}`);
      console.log('');
    }
    if (!open.length) console.log('no unresolved findings\n');
    else {
      console.log(`UNRESOLVED (${open.length}):\n`);
      for (const f of open) {
        console.log(`  [${f.id}] ${f.page} · ${f.check} · ${f.viewports.join(', ')}`);
        console.log(`      ${f.detail}`);
      }
      console.log(`\nFix them, or accept with a reason:  node audit.mjs --accept\n`);
    }
  }
  process.exit(open.length ? 1 : 0);
};

run().catch(e => { console.error(e); process.exit(2); });
