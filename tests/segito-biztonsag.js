// A biztonsági, tárolási és offline tesztek (10-, 11-, 12-*.spec.js) saját segédfüggvényei.
// A közös segito.js-t nem módosítja; csak arra épít.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { GYOKER, cachePath, konyvtarak } from './cdn.js';
import { kesz, expect } from './segito.js';

export const SZKRIPT_UT = path.join(GYOKER, '_fejlesztes', 'uj', 'szkript.js');
export const FEJ_UT = path.join(GYOKER, '_fejlesztes', 'uj', 'fej.html');
export const SW_UT = path.join(GYOKER, 'sw.js');
export const olvasFajl = ut => fs.readFileSync(ut, 'utf8');

/* ---------------------------------------------------------------- támadó nevek */
// Mindegyik, ha HTML-ként értelmeződne, a window.__xss számlálót növelné (vagy alert-et hívna).
export const XSS = {
  img: '<img src=x onerror="window.__xss=(window.__xss||0)+1">',
  svg: '<svg onload="window.__xss=(window.__xss||0)+1"></svg>',
  attr: '"><img src=x onerror=window.__xss=(window.__xss||0)+1>',
  attr2: "'><img src=x onerror=window.__xss=(window.__xss||0)+1>",
  script: '</script><script>window.__xss=(window.__xss||0)+1</script>',
  iframe: '<iframe srcdoc="<script>parent.__xss=(parent.__xss||0)+1</script>"></iframe>',
  alert: '<img src=x onerror=alert(1)>'
};
export const NEVEK = {
  idezojel: 'Dr. "Kiss"',
  aposztrof: "O''Brien",
  emoji: 'Fogász 👩‍⚕️ 🦷',
  rtl: 'Anna ‮abc‬ és ‏RLM',
  hosszu: Array.from({ length: 40 }, (_, i) => `hosszúnév${i + 1}`).join(' '),   // ~430 karakter, szóközökkel
  hosszuSzo: 'Ő' + 'a'.repeat(318) + 'Z',                                       // 320 karakter, szóköz nélkül
  sablon: '${7*7} {{7*7}} {cimzett} %s'
};

/* ---------------------------------------------------------------- XSS-figyelés */
// A böngésző párbeszédablakait (alert, confirm, prompt) naplózza és elutasítja.
export function xssFigyelo(page) {
  const f = { dialogok: [] };
  page.on('dialog', d => { f.dialogok.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  return f;
}
// sem a window.__xss nem jött létre, sem böngésző-párbeszédablak nem nyílt meg (és nincs beszúrt <img src=x>, <svg onload>, <iframe>)
export async function nincsXss(page, figyelo, hol = '') {
  const allapot = await page.evaluate(() => ({
    xss: window.__xss,
    kepek: [...document.querySelectorAll('img')].filter(i => /(^|\/)x$/.test(i.getAttribute('src') || '')).length,
    onload: document.querySelectorAll('[onerror],[onload]').length,
    iframe: document.querySelectorAll('iframe').length
  }));
  expect(allapot.xss, `window.__xss ${hol}`).toBeUndefined();
  expect(allapot.kepek, `beszúrt <img src=x> ${hol}`).toBe(0);
  expect(allapot.onload, `beszúrt on…= attribútum ${hol}`).toBe(0);
  expect(allapot.iframe, `beszúrt <iframe> ${hol}`).toBe(0);
  expect(figyelo.dialogok, `böngésző-párbeszédablak ${hol}`).toEqual([]);
}

/* ---------------------------------------------------------------- fájlok */
// a SheetJS helyi példánya: a CDN-gyorsítótárból, vagy (ha az alkalmazás saját tárhelyre teszi) a tárolóból
function xlsxForras() {
  const html = fs.readFileSync(path.join(GYOKER, 'index.html'), 'utf8');
  const m = html.match(/xlsx:\s*\{\s*url:\s*'([^']+)'/);
  if (!m) throw new Error('Az index.html KONYVTARAK listájában nincs xlsx.');
  return /^https?:/.test(m[1]) ? cachePath(m[1]) : path.join(GYOKER, m[1].replace(/^\.?\//, ''));
}
// .xlsx a SheetJS-szel (ugyanaz a fájl, amit az alkalmazás használ), egy külön üres lapon: lapok = { 'Adatbázis': [[...], ...] }
export async function xlsxKeszit(context, lapok) {
  const p = await context.newPage();
  try {
    await p.setContent('<!doctype html><title>xlsx</title>');
    await p.addScriptTag({ content: fs.readFileSync(xlsxForras(), 'utf8') });
    const b64 = await p.evaluate(lapok => {
      const wb = window.XLSX.utils.book_new();
      for (const [nev, sorok] of Object.entries(lapok)) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(sorok), nev);
      return window.XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    }, lapok);
    return Buffer.from(b64, 'base64');
  } finally { await p.close(); }
}
export const jsonBuffer = obj => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2), 'utf8');
// a „Mentés fájlba” formátuma
export function mentesJson({ orvosok, tetelek, emailek = {}, beallitasok = undefined }) {
  return { alkalmazas: 'dentAl-arlista', formatum: 1, mentve: '2026-10-10T07:00:00.000Z', cegnev: 'dentÁl', orvosok, emailek, tetelek, beallitasok };
}

/* ---------------------------------------------------------------- felület */
export async function arakNezet(page) {
  await page.evaluate(() => { location.hash = '#arak'; });
  await page.locator('#arTabla').waitFor();
}
export async function listaNezet(page) {
  await page.evaluate(() => { history.replaceState(null, '', location.pathname); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await page.locator('#nezetArlista').waitFor();
}
// van-e vízszintes görgetés az oldalon (a teljes dokumentum szélesebb a nézetnél)
export async function vizszintesTulcsordulas(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, kliens: d.clientWidth, tul: d.scrollWidth > d.clientWidth + 1 };
  });
}
// az elemek, amelyek jobbra kilógnak a nézetből (csak a láthatók)
export async function kilogoElemek(page, gyoker = 'body') {
  return page.evaluate(gyoker => {
    const w = document.documentElement.clientWidth;
    const r = [];
    for (const e of document.querySelectorAll(gyoker + ' *')) {
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none') continue;
      let p = e.parentElement, vagott = false;                 // görgethető/levágó szülőn belül nem számít
      while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { vagott = true; break; } p = p.parentElement; }
      if (!vagott && b.right > w + 1) r.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${e.className && e.className.baseVal === undefined ? e.className : ''} (jobb széle ${Math.round(b.right)} > ${w})`);
    }
    return r.slice(0, 10);
  }, gyoker);
}

/* ---------------------------------------------------------------- saját, leállítható szerver (offline-próbákhoz) */
// A tároló gyökerét szolgálja ki egy szabad porton; a bezar() után a cím nem érhető el (mintha nem lenne internet).
export async function sajatSzerver() {
  const TIPUS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const keresek = [];
  const szerver = http.createServer((req, res) => {
    let ut; try { ut = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    keresek.push(req.method + ' ' + ut);
    if (ut.endsWith('/')) ut += 'index.html';
    const fajl = path.resolve(GYOKER, '.' + ut);
    if (!fajl.startsWith(GYOKER + path.sep) || /[\\/](node_modules|\.git|_fejlesztes)[\\/]/.test(fajl)) { res.writeHead(403).end(); return; }
    fs.readFile(fajl, (hiba, adat) => {
      if (hiba) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': TIPUS[path.extname(fajl).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : adat);
    });
  });
  await new Promise(r => szerver.listen(0, '127.0.0.1', r));
  const port = szerver.address().port;
  return {
    url: `http://127.0.0.1:${port}/`, keresek,
    async bezar() {
      await new Promise(r => { szerver.close(() => r()); if (szerver.closeAllConnections) szerver.closeAllConnections(); });
    }
  };
}

/* ---------------------------------------------------------------- offline-gyorsítótár */
// Megvárja, hogy minden offline könyvtár az IndexedDB-ben legyen.
// (A közös pdfKesz() erre nem alkalmas: a waitForFunction az aszinkron predikátum Promise-át igaznak veszi, ezért nem vár.)
export async function offlineKesz(page, timeout = 45_000) {
  await expect.poll(() => page.evaluate(async () => (await window.dentAl.offlineAllapot()).kesz), { timeout, intervals: [200, 300, 500] }).toBe(true);
}
// az offline-gyorsítótár egy elemének felülírása (pl. meghamisított példány)
export async function idbIr(page, url, bajtokSzoveg) {
  await page.evaluate(async ([url, szoveg]) => {
    const d = await new Promise((res, rej) => { const r = indexedDB.open('dentAl-arlista'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = d.transaction('fajlok', 'readwrite');
      tx.objectStore('fajlok').put({ bajtok: new TextEncoder().encode(szoveg).buffer, ido: Date.now() }, url);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    d.close();
  }, [url, bajtokSzoveg]);
}
export const KONYVTAR = nev => konyvtarak().find(k => k.url.includes(nev));

/* ---------------------------------------------------------------- PDF */
export async function pdfSzoveg(elemzes) {
  return elemzes.oldal.map(o => o.elemek.map(x => x.s).join(' ')).join('\n');
}
export { kesz };
