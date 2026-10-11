// Közös segédfüggvények és fixture-ök a dentÁl árlista tesztjeihez.
//
// - A CDN-kéréseket (pdfmake, IBM Plex, SheetJS, pdf.js) a tests/.cache/cdn helyi másolatából szolgáljuk ki,
//   minden más külső kérést (pl. api.github.com) letiltunk és naplózunk.
// - Minden teszt végén ellenőrizzük, hogy nem volt el nem kapott JS-hiba és konzolhiba (hibak.enged(/minta/) kivétel).
// - nyit(): az alkalmazás megnyitása előre beállított tárolóval (orvosok, tételek, árak, választás, beállítások),
//   CONFIG-felülírással és rögzített dátummal.
import { test as alapTeszt, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { CDN_MINTA, cachePath, tipus, GYOKER } from './cdn.js';

export { expect };
export const KIMENET = path.join(GYOKER, 'tests', 'kimenet');
export const FIXTURES = path.join(GYOKER, 'tests', 'fixtures');

export const KULCS = {
  adatok: 'dentAl.adatok.v1', valasztas: 'dentAl.valasztas.v1', sorszam: 'dentAl.sorszam.v1',
  beall: 'dentAl.beallitasok.v1', elozo: 'dentAl.betoltesElotti.v1', github: 'dentAl.github.v1'
};

/* ---------------------------------------------------------------- adatok */
// A beépített mintaadatok (azonosak a vba.xlsm „Adatbázis” lapjával).
export const MINTA = {
  orvosok: ['Peti', 'Dani', 'Anna'],
  tetelek: [['tetel1', [10000, 15500, 7650]], ['tetel2', [8000, 13100, 5000]], ['tetel3', [9000, 1000, 6000]], ['tetel4', [10000, 2000, 7000]]]
};

// adatok({ orvosok: ['Peti', { nev: 'Dani', email: 'd@x.hu' }], tetelek: [['Név', [ár1, ár2], 'Csoport'], { nev, arak, csoport }] })
// Az ár null/undefined: az orvosnak nincs ára arra a tételre.
export function adatok({ orvosok = MINTA.orvosok, tetelek = MINTA.tetelek } = {}) {
  const o = orvosok.map((x, i) => (typeof x === 'string' ? { id: 'o' + (i + 1), nev: x, email: '' } : { id: x.id || 'o' + (i + 1), nev: x.nev, email: x.email || '' }));
  const t = [], arak = {};
  tetelek.forEach((x, i) => {
    const [nev, arLista = [], csoport = ''] = Array.isArray(x) ? x : [x.nev, x.arak, x.csoport];
    const id = (!Array.isArray(x) && x.id) || 't' + (i + 1);
    t.push({ id, nev, csoport });
    arak[id] = {};
    o.forEach((orv, j) => { const v = arLista[j]; if (v != null) arak[id][orv.id] = v; });
  });
  return { formatum: 1, orvosok: o, tetelek: t, arak, modositva: null };
}
// n darab tétel (egy orvos, „Tétel 01”…), a sok tételes PDF-próbákhoz
export function sokTetel(n, { orvos = 'Dr. Szűcs Ádám', nevMinta = i => `Tétel ${String(i).padStart(2, '0')} – fogpótlás ő ű Ő Ű`, ar = i => 1000 * i + 250, csoport = () => '' } = {}) {
  return adatok({ orvosok: [orvos], tetelek: Array.from({ length: n }, (_, k) => [nevMinta(k + 1), [ar(k + 1)], csoport(k + 1)]) });
}
// mennyiségek tételnév (vagy id) szerint → a valasztas.menny formátuma
export function valasztas(adat, { orvos = null, menny = {}, datum = null } = {}) {
  const m = {};
  for (const [kulcs, n] of Object.entries(menny)) {
    const t = adat.tetelek.find(x => x.nev === kulcs || x.id === kulcs);
    if (!t) throw new Error('nincs ilyen tétel: ' + kulcs);
    m[t.id] = n;
  }
  const o = orvos == null ? null : adat.orvosok.find(x => x.nev === orvos || x.id === orvos);
  if (orvos != null && !o) throw new Error('nincs ilyen orvos: ' + orvos);
  return { orvosId: o ? o.id : null, menny: m, datum };
}

/* ---------------------------------------------------------------- fixture-ök */
export const test = alapTeszt.extend({
  // CDN → helyi másolat; minden más külső kérés tiltva (a context.kulsoKeresek listában naplózva)
  context: async ({ context }, use) => {
    context.kulsoKeresek = [];
    // csak a http(s) kérések: a blob: és data: címek (a könyvtárak blob:-szkriptként futnak) maradjanak érintetlenek
    await context.route(url => /^https?:$/.test(url.protocol) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url.href), async route => {
      const url = route.request().url();
      if (CDN_MINTA.test(url) && !context.cdnTiltva) {
        const hely = cachePath(url.split('?')[0]);
        if (fs.existsSync(hely)) {
          return route.fulfill({ status: 200, body: fs.readFileSync(hely), headers: { 'content-type': tipus(url), 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
        }
      }
      context.kulsoKeresek.push(url);
      return route.abort('blockedbyclient');
    });
    await use(context);
  },
  // el nem kapott JS-hibák és konzolhibák gyűjtése; a teszt végén ellenőrizve
  hibak: [async ({ page }, use) => {
    const h = { konzol: [], oldal: [], engedett: [], enged(re) { this.engedett.push(re); } };
    page.on('console', m => { if (m.type() === 'error') h.konzol.push(m.text()); });
    page.on('pageerror', e => h.oldal.push(String(e && e.stack || e)));
    await use(h);
    const szur = t => t.filter(s => !h.engedett.some(re => re.test(s)));
    expect.soft(szur(h.oldal), 'el nem kapott JS-hiba az oldalon').toEqual([]);
    expect.soft(szur(h.konzol), 'konzolhiba az oldalon').toEqual([]);
  }, { auto: true }]
});

/* ---------------------------------------------------------------- megnyitás */
// nyit(page, { adat, valasztas, beall, sorszam, tarolo: {kulcs: érték}, config: {…}, ido: '2026-10-10T09:00:00', hash: '#arak', tarolasTiltva })
export async function nyit(page, { adat = null, valasztas: v = null, beall = null, sorszam = null, tarolo = {}, config = null, ido = null, hash = '', tarolasTiltva = false } = {}) {
  if (ido) await page.clock.setFixedTime(new Date(ido));
  const mag = Object.assign({}, tarolo);
  if (adat) mag[KULCS.adatok] = adat;
  if (v) mag[KULCS.valasztas] = v;
  if (beall) mag[KULCS.beall] = beall;
  if (sorszam) mag[KULCS.sorszam] = sorszam;
  await page.addInitScript(({ mag, config, tarolasTiltva }) => {
    try {
      if (!sessionStorage.getItem('__teszt_mag')) {
        for (const [k, val] of Object.entries(mag)) localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
        sessionStorage.setItem('__teszt_mag', '1');
      }
    } catch (e) { /* letiltott tároló */ }
    if (tarolasTiltva) {
      const tilt = () => { throw new DOMException('A tároló le van tiltva (teszt)', 'SecurityError'); };
      try { Object.defineProperty(window, 'localStorage', { configurable: true, get: tilt }); } catch (e) { /* nincs */ }
    }
    if (config) {
      let ertek;
      Object.defineProperty(window, 'CONFIG', { configurable: true, get() { return ertek; }, set(x) { ertek = Object.assign({}, x, config); } });
    }
  }, { mag, config, tarolasTiltva });
  await page.goto('/index.html' + hash);
  await kesz(page);
}
// az alkalmazás elindult (a gombok feliratai kint vannak)
export async function kesz(page) {
  await page.waitForFunction(() => window.dentAl && document.querySelector('#letoltGomb') && document.querySelector('#letoltGomb').textContent.trim().length > 0);
}
// a PDF-könyvtárak betöltődtek (a háttérbeli előkészítés után)
export async function pdfKesz(page) {
  await expect.poll(() => page.evaluate(async () => (await window.dentAl.offlineAllapot()).kesz), { timeout: 30_000 }).toBe(true);
}

/* ---------------------------------------------------------------- felület */
export const tetelSor = (page, nev) => page.locator('#tetelLista li.tetel').filter({ has: page.locator('.tetel-nev', { hasText: new RegExp('^' + escRe(nev) + '$') }) });
export const mennyMezo = (page, nev) => tetelSor(page, nev).locator('input.menny');
export async function orvosValaszt(page, nev) {
  const sel = page.locator('#orvosSelect');
  if (await sel.count()) await sel.selectOption({ label: nev });
  else await page.locator('#orvosValaszto button[role=radio]', { hasText: new RegExp('^' + escRe(nev) + '$') }).click();
}
export async function mennyBeir(page, nev, n) {
  const m = mennyMezo(page, nev);
  await m.fill(String(n));
  await m.press('Enter');
}
export const osszegSzoveg = page => page.locator('#osszeg').innerText();
export function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// a kijelzett forintszöveg számmá („12 345 Ft” → 12345; nem törő és keskeny szóköz is)
export function ftSzam(s) { const m = String(s).replace(/[\s  ]/g, '').match(/-?\d+(?:,\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; }

// PDF letöltése a sávban lévő gombbal; vissza: { nev, bajtok }
export async function letoltes(page, gomb = '#letoltGomb') {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.locator(gomb).click()]);
  const hely = await dl.path();
  return { nev: dl.suggestedFilename(), bajtok: fs.readFileSync(hely) };
}
// a PDF közvetlenül az alkalmazás előkészítőjéből (felület nélkül; gyors PDF-próbákhoz)
export async function pdfKozvetlen(page) {
  return page.evaluate(async () => {
    const k = await window.dentAl.elokeszit();
    if (!k) return null;
    const u = new Uint8Array(await k.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return { b64: btoa(s), tulcsordul: k.tulcsordul, szint: k.szint, oldalak: k.oldalak, elfer: k.elfer, fajlnev: k.fajlnev, sorszam: k.sorszam, sorDb: k.sorDb };
  });
}

/* ---------------------------------------------------------------- PDF-elemzés */
// A pdf.js (ugyanaz, amit az alkalmazás használ) egy külön tesztoldalon: szöveg, oldalméret, betűk, képpé alakítás.
async function nezo(context) {
  const p = await context.newPage();
  await p.goto('/tests/pdfnezo.html');
  await p.waitForFunction(() => window.nezoKesz === true);
  return p;
}
const b64 = b => (Buffer.isBuffer(b) ? b.toString('base64') : typeof b === 'string' ? b : Buffer.from(b).toString('base64'));
// { oldalak, oldal: [{ w, h, elemek: [{ s, x, y, w, h, font }], betuk: [{ nev, beagyazott }] }], info }
export async function pdfElemez(context, bajtok) {
  const p = await nezo(context);
  try { return await p.evaluate(x => window.elemez(x), b64(bajtok)); } finally { await p.close(); }
}
// képpé alakítás (1. oldal) → { png: Buffer, w, h, statisztika }; szurke: szürkeárnyalatos
export async function pdfKep(context, bajtok, { skala = 2, szurke = false, oldal = 1 } = {}) {
  const p = await nezo(context);
  try {
    const r = await p.evaluate(([x, skala, szurke, oldal]) => window.kep(x, { skala, szurke, oldal }), [b64(bajtok), skala, szurke, oldal]);
    return Object.assign(r, { png: Buffer.from(r.png.split(',')[1], 'base64') });
  } finally { await p.close(); }
}
// a PDF betűi a nyers fájlból (mint a pdffonts): név, részhalmaz-e (ABCDEF+), beágyazott-e
export function pdfBetuk(bajtok) {
  const s = Buffer.from(bajtok).toString('latin1');
  const leirok = [...s.matchAll(/<<[^]*?\/Type\s*\/FontDescriptor[^]*?>>/g)].map(m => m[0]);
  const beagyazott = new Set(leirok.filter(d => /\/FontFile[23]?\s+\d+\s+\d+\s+R/.test(d)).map(d => (d.match(/\/FontName\s*\/([^\s/<>[\]]+)/) || [])[1]));
  const nevek = [...new Set([...s.matchAll(/\/BaseFont\s*\/([^\s/<>[\]]+)/g)].map(m => m[1]))];
  return nevek.map(nev => ({ nev, reszhalmaz: /^[A-Z]{6}\+/.test(nev), beagyazott: beagyazott.has(nev) }));
}
export function pdfOldalSzam(bajtok) {
  const s = Buffer.from(bajtok).toString('latin1');
  return (s.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
}

/* ---------------------------------------------------------------- értesítések */
// Az értesítések (toast) 4,5–15 mp-ig látszanak; terhelt gépen egy késői ellenőrzés lemaradhat róluk. A napló minden
// megjelent értesítést rögzít ('hiba: ' előtaggal a hibákat). A navigálás ELŐTT kell elindítani (page vagy context).
export async function uzenetNaploIndit(celpont) {
  await celpont.addInitScript(() => {
    window.__uzenetNaplo = [];
    // az egész dokumentumot figyeli a legelejétől: az induláskori értesítés még a DOMContentLoaded előtt megjelenik
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList.contains('uzenet') && n.parentElement && n.parentElement.id === 'uzenetek') {
          window.__uzenetNaplo.push((n.classList.contains('hiba') ? 'hiba: ' : '') + n.textContent);
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}
export const uzenetNaplo = page => page.evaluate(() => (window.__uzenetNaplo || []).slice());
// két képkocka: a fókusz utáni igazító görgetés (requestAnimationFrame) lefutott
export const kepkockak = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/* ---------------------------------------------------------------- kimenet */
export function kimenetUt(...reszek) { const p = path.join(KIMENET, ...reszek); fs.mkdirSync(path.dirname(p), { recursive: true }); return p; }
export function projektNev(testInfo) { return testInfo.project.name; }
