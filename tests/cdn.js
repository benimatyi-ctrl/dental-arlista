// A CDN-ről töltött könyvtárak (pdfmake, IBM Plex, SheetJS, pdf.js) helyi másolata a tesztekhez.
// Az index.html KONYVTARAK listájából olvassa a címeket és az SRI-ellenőrzőösszegeket; egyszer tölti le őket
// a tests/.cache/cdn mappába, ellenőrzi az SRI-t, és a tesztek innen kapják meg (gyors, determinisztikus).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const GYOKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = path.join(GYOKER, 'tests', '.cache', 'cdn');
export const CDN_MINTA = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//;

export function konyvtarak(html = fs.readFileSync(path.join(GYOKER, 'index.html'), 'utf8')) {
  const r = [];
  const minta = /url:\s*'(https:\/\/[^']+)',\s*sri:\s*'([^']+)'/g;
  let m; while ((m = minta.exec(html))) r.push({ url: m[1], sri: m[2] });
  if (r.length < 5) throw new Error('Az index.html KONYVTARAK listája nem olvasható (' + r.length + ' tétel).');
  return r;
}
export function cachePath(url) {
  const u = new URL(url);
  return path.join(CACHE, u.host, decodeURIComponent(u.pathname));
}
export function sriJo(buf, sri) {
  const [alg, vart] = sri.split('-');
  return crypto.createHash(alg).update(buf).digest('base64') === vart;
}
export async function letoltMindet() {
  for (const { url, sri } of konyvtarak()) {
    const hely = cachePath(url);
    if (fs.existsSync(hely) && sriJo(fs.readFileSync(hely), sri)) continue;
    const v = await fetch(url);
    if (!v.ok) throw new Error(`Nem tölthető le a tesztekhez: ${url} (HTTP ${v.status}). Az első futtatáshoz internet kell.`);
    const buf = Buffer.from(await v.arrayBuffer());
    if (!sriJo(buf, sri)) throw new Error(`SRI-eltérés: ${url}`);
    fs.mkdirSync(path.dirname(hely), { recursive: true });
    fs.writeFileSync(hely, buf);
  }
}
export function tipus(url) {
  if (url.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (url.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}
