// Build website/print/zariia-key-card.pdf from key-card-print.html.
//
// Two pages at exactly 85 × 55 mm — a standard visiting card — front then back.
// printBackground is required or the card prints as white paper with hairlines,
// which is not the object. Run from the repo root:  node brand/make-key-card-pdf.mjs
import puppeteer from '/Users/prayasabhinav/.nvm/versions/node/v20.20.0/lib/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'key-card-print.html');
const outDir = path.join(here, '..', 'website', 'print');
const out = path.join(outDir, 'zariia-key-card.pdf');
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('file://' + src, { waitUntil: 'networkidle0' });
await page.pdf({ path: out, width: '85mm', height: '55mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`wrote ${path.relative(path.join(here, '..'), out)} — ${kb} KB`);
