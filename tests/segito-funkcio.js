// A funkcionális tesztek (20–28) saját segédfüggvényei: tároló-pillanatkép, Árak nézet, párbeszédablak,
// fájlválasztó, Excel-fájl készítése (SheetJS a helyi CDN-másolatból), PDF-szöveg soronként.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { expect, KULCS, FIXTURES, pdfElemez, letoltes, ftSzam, kesz, pdfKesz } from './segito.js';
import { cachePath } from './cdn.js';

export const EXCEL_MAPPA = path.join(FIXTURES, 'excel');
export const VBA_XLSM = path.join(FIXTURES, 'privat', 'vba.xlsm');
export const excelFajl = nev => path.join(EXCEL_MAPPA, nev);

// a beépített mintaadatok = a vba.xlsm „Adatbázis” lapja (tétel → [Peti, Dani, Anna])
export const ADATBAZIS = {
  orvosok: ['Peti', 'Dani', 'Anna'],
  arak: { tetel1: [10000, 15500, 7650], tetel2: [8000, 13100, 5000], tetel3: [9000, 1000, 6000], tetel4: [10000, 2000, 7000] }
};

/* ---------------------------------------------------------------- szöveg */
// nem törő és keskeny szóközök → sima szóköz, többszörös szóköz → egy
export const ny = s => String(s).replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ').trim();
// magyar ezres tagolás, mint az alkalmazásban (a tesztekben sima szóközzel hasonlítunk)
export function ftVart(n) {
  const neg = n < 0; const kerek = Math.round(Math.abs(n) * 100) / 100;
  const egesz = Math.floor(kerek); const tort = Math.round((kerek - egesz) * 100);
  const e = String(egesz).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const t = tort ? ',' + String(tort).padStart(2, '0').replace(/0$/, '') : '';
  return (neg ? '-' : '') + e + t + ' Ft';
}

/* ---------------------------------------------------------------- tároló */
// a dentAl.* kulcsok nyers (bájtra pontos) értéke
export function taroloPillanat(page) {
  return page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('dentAl.')) o[k] = localStorage.getItem(k); }
    return o;
  });
}
export const taroltAdat = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KULCS.adatok);
export const taroltValasztas = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KULCS.valasztas);
export const taroltBeall = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KULCS.beall);
// a tárolt mennyiségek tételnév szerint ({ tetel1: 2, … })
export async function taroltMennyNevvel(page) {
  return page.evaluate(([ka, kv]) => {
    const a = JSON.parse(localStorage.getItem(ka) || 'null');
    const v = JSON.parse(localStorage.getItem(kv) || 'null') || { menny: {} };
    const r = {};
    for (const [id, n] of Object.entries(v.menny || {})) { const t = a ? a.tetelek.find(x => x.id === id) : null; r[t ? t.nev : id] = n; }
    return r;
  }, [KULCS.adatok, KULCS.valasztas]);
}
// az adat név szerinti alakja (azonosítók nélkül) — az oda-vissza összevetésekhez
export function nevesAlak(a) {
  const oNev = new Map(a.orvosok.map(o => [o.id, o.nev]));
  return {
    orvosok: a.orvosok.map(o => ({ nev: o.nev, email: o.email || '' })),
    tetelek: a.tetelek.map(t => {
      const arak = {};
      for (const [oId, v] of Object.entries((a.arak || {})[t.id] || {})) if (oNev.has(oId)) arak[oNev.get(oId)] = v;
      return { nev: t.nev, csoport: t.csoport || '', arak };
    })
  };
}

/* ---------------------------------------------------------------- felület */
// újratöltés; előtte megvárjuk a háttérbeli könyvtárletöltéseket, különben a WebKit a navigáció miatt megszakadt
// CDN-kérést JS-hibaként jelzi (ez csak a tesztkeret útválasztója miatt látszik), és a „load” esemény is elmaradhat
export async function ujratolt(page) {
  await pdfKesz(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await kesz(page);
}
export async function arakMegnyit(page) {
  if (!(await page.locator('#nezetArak').isVisible())) await page.locator('#nezetGomb').click();   // újratöltés után már ott lehet (#arak)
  await expect(page.locator('#nezetArak')).toBeVisible();
  await expect(page.locator('#arTabla')).toBeVisible();
}
export async function listaraVissza(page) {
  await page.locator('#nezetGomb').click();
  await expect(page.locator('#nezetArlista')).toBeVisible();
}
export const dlg = page => page.locator('#dlg');
export const dlgGomb = (page, szoveg) => page.locator('#dlg .dlg-lab button', { hasText: szoveg });
export async function dlgNyitva(page) { await expect(page.locator('#dlg')).toBeVisible(); return page.locator('#dlg'); }
export async function dlgZarva(page) { await expect(page.locator('#dlg')).toBeHidden(); }
// a sáv ideiglenes vagy tartós üzenete és a felugró értesítések szövege együtt
export async function uzenetek(page) {
  const sav = await page.locator('#savUzenet').isVisible() ? await page.locator('#savUzenet').innerText() : '';
  const fel = await page.locator('#uzenetek').innerText();
  return ny(sav + ' ' + fel);
}
export async function fajlValaszt(page, gomb, fajl) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator(gomb).click()]);
  await fc.setFiles(fajl);
}
// az Árak táblázat egy cellája
export const arCella = (page, tetel, orvos) => page.getByRole('textbox', { name: `${tetel} ára, ${orvos}`, exact: true });
// beírás egy ár-mezőbe, majd a mező elhagyása (Tab)
export async function arBeir(page, tetel, orvos, szoveg) {
  const c = arCella(page, tetel, orvos);
  await c.click();
  await c.fill(szoveg);
  await c.evaluate(e => e.blur());
}
// új orvos / tétel az Árak nézetben a párbeszédablakkal
export async function ujElemFelvesz(page, fajta, nev, { email = null, csoport = null } = {}) {
  await page.locator(fajta === 'tetel' ? '#ujTetelGomb' : '#ujOrvosGomb').click();
  await dlgNyitva(page);
  await page.locator('#nevMezo').fill(nev);
  if (email != null) await page.locator('#emailMezo').fill(email);
  if (csoport != null) await page.locator('#csoportMezo').fill(csoport);
  await dlgGomb(page, 'Hozzáadás').click();
}
// az Árak táblázatban a név gombja (szerkesztés)
export const orvosFejGomb = (page, nev) => page.locator('#arTabla .fej-gomb', { has: page.locator('span', { hasText: new RegExp('^' + esc(nev) + '$') }) });
export const tetelSorGomb = (page, nev) => page.locator('#arTabla .sor-gomb', { has: page.locator('span', { hasText: new RegExp('^' + esc(nev) + '$') }) });
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// a sor „N db = X Ft” szövege és az egységár szövege
export const sorOsszeg = (page, nev) => page.locator('#tetelLista li.tetel').filter({ has: page.locator('.tetel-nev', { hasText: new RegExp('^' + esc(nev) + '$') }) }).locator('.tetel-sor-ossz');
export const sorAr = (page, nev) => page.locator('#tetelLista li.tetel').filter({ has: page.locator('.tetel-nev', { hasText: new RegExp('^' + esc(nev) + '$') }) }).locator('.tetel-ar');

// PDF letöltése, majd a „kész” panel bezárása („Új árlista” / „Bezárás”)
export async function letoltesEsUj(page) {
  const r = await letoltes(page);
  await expect(page.locator('#savKesz')).toBeVisible();
  const kesz = { cim: ny(await page.locator('#keszCim').innerText()), fajl: ny(await page.locator('#keszFajl').innerText()) };
  await page.locator('#keszUjGomb').click();
  await expect(page.locator('#savNormal')).toBeVisible();
  return Object.assign(r, { kesz });
}

/* ---------------------------------------------------------------- PDF */
// a PDF szövege sorokra bontva: [{ y, cellak: ['tetel1', '2 db', '10 000 Ft', '20 000 Ft'] }], és az egész szöveg
export async function pdfSorok(context, bajtok) {
  const e = await pdfElemez(context, bajtok);
  const elemek = e.oldal[0].elemek.filter(x => x.s && x.s.trim()).map(x => Object.assign({}, x, { s: ny(x.s) }));
  elemek.sort((a, b) => b.y - a.y || a.x - b.x);
  const sorok = [];
  for (const x of elemek) {
    const s = sorok.find(r => Math.abs(r.y - x.y) < 2);
    if (s) s.elemek.push(x); else sorok.push({ y: x.y, elemek: [x] });
  }
  for (const s of sorok) {
    s.elemek.sort((a, b) => a.x - b.x);
    const cellak = [];
    let elozo = null;
    for (const x of s.elemek) {
      if (elozo && x.x - (elozo.x + elozo.w) < 3) cellak[cellak.length - 1] = ny(cellak[cellak.length - 1] + (x.x - (elozo.x + elozo.w) > 0.8 ? ' ' : '') + x.s);
      else cellak.push(x.s);
      elozo = x;
    }
    s.cellak = cellak;
  }
  sorok.sort((a, b) => b.y - a.y);
  const szoveg = sorok.map(s => s.cellak.join(' ')).join('\n');
  return { e, sorok, szoveg };
}
// a táblázat egy tételsora: { menny, ar, osszeg } (számként)
export function pdfTetelSor(p, nev) {
  const s = p.sorok.find(r => r.cellak[0] === nev && r.cellak.length >= 4);
  if (!s) return null;
  const c = s.cellak;
  return { cellak: c, menny: ftSzam(c[c.length - 3]), ar: ftSzam(c[c.length - 2]), osszeg: ftSzam(c[c.length - 1]) };
}
export function pdfVegosszeg(p) {
  const m = p.szoveg.match(/Végösszeg\s*\n?\s*([-\d ]+(?:,\d+)?) Ft/);
  return m ? { szoveg: m[1] + ' Ft', szam: ftSzam(m[1]) } : null;
}
export function pdfSorszam(p) { const m = p.szoveg.match(/Sorszám:\s*(\d{8}-\d{2,})/); return m ? m[1] : null; }

/* ---------------------------------------------------------------- Excel (SheetJS Node alatt) */
let XLSX_NODE = null;
// a tesztekhez letöltött SheetJS 0.18.5 (ugyanaz, mint az alkalmazásé) Node alatt
export function xlsxKonyvtar() {
  if (XLSX_NODE) return XLSX_NODE;
  const forras = fs.readFileSync(cachePath('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'), 'utf8');
  const modul = { exports: {} };
  vm.runInThisContext('(function (module, exports, require) {' + forras + '\n})', { filename: 'xlsx.full.min.js' })(modul, modul.exports, createRequire(import.meta.url));
  XLSX_NODE = modul.exports;
  return XLSX_NODE;
}
// munkafüzet készítése: lapok = { 'Adatbázis': [[null, 'Peti'], ['tetel1', 100]] } → { name, mimeType, buffer }
export function xlsxKeszit(nev, lapok, { bookType = 'xlsx' } = {}) {
  const X = xlsxKonyvtar();
  const wb = X.utils.book_new();
  for (const [lap, sorok] of Object.entries(lapok)) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sorok), lap);
  const buffer = Buffer.from(X.write(wb, { type: 'buffer', bookType }));
  return { name: nev, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer };
}
// egy meglévő munkafüzet „Adatbázis” lapja tömbként (pl. a vba.xlsm-ből)
export function adatbazisLap(fajl) {
  const X = xlsxKonyvtar();
  const wb = X.read(fs.readFileSync(fajl), { type: 'buffer' });
  const ws = wb.Sheets['Adatbázis'];
  return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}
