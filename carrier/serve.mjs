// serve.mjs — tiny static server for the player during development.
//
// The player imports ES modules and uses Web Crypto, so it must be served over HTTP
// (not opened as file://). In production this is the "one HTTPS fetch, once, per
// just a local dev server. Run: `node serve.mjs` then open http://localhost:8787/
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = process.cwd();
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
};

http
  .createServer((req, res) => {
    const rel = req.url === '/' ? '/player/index.html' : decodeURIComponent(req.url.split('?')[0]);
    const path = normalize(join(ROOT, rel));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('404');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  })
  .listen(8787, () => console.log('Zariia player: http://localhost:8787/'));
