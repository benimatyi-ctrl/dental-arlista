// Egyszerű statikus szerver a tesztekhez: a tároló gyökerét szolgálja ki (index.html, sw.js, ikonok, tests/…).
// Indítás: node tests/szerver.js [port]   — a playwright.config.js magától indítja.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GYOKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const TIPUS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let ut;
  try { ut = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (ut.endsWith('/')) ut += 'index.html';
  const fajl = path.resolve(GYOKER, '.' + ut);
  if (!fajl.startsWith(GYOKER + path.sep) || /[\/]node_modules[\/]|[\/]\.git[\/]/.test(fajl)) { res.writeHead(403).end(); return; }
  fs.readFile(fajl, (hiba, adat) => {
    if (hiba) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('nincs: ' + ut); return; }
    res.writeHead(200, { 'content-type': TIPUS[path.extname(fajl).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : adat);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`tesztszerver: http://127.0.0.1:${PORT}/ (${GYOKER})`));
