// A PDF- és teljesítménytesztek saját segédfüggvényei (a 30-pdf.spec.js és az 50-teljesitmeny.spec.js használja).
//
// - Tesztadatok: vegyes tételnevek (rövid, kétsoros, ékezetes), csoportok, ezres tagolású árak.
// - A pdf.js szövegelemeiből sorok és táblázatsorok (név, mennyiség, egységár, összesen) rakhatók össze.
// - A nyers PDF-ből (zlib-bel kibontva) a betűk ToUnicode-táblája, a karakterszélességek és a képek olvashatók ki.
// - A renderelt oldalon (a tests/pdfnezo.html-ben, ugyanazzal a pdf.js-sel) képpont-szintű vizsgálat: régiók színe,
//   tintafedés, elárasztás (a fog kivágása), soronkénti fénysűrűség.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { adatok, kimenetUt, ftSzam, kesz, KULCS } from './segito.js';
import { CDN_MINTA, cachePath, tipus } from './cdn.js';

export const A4 = { w: 595.28, h: 841.89 };
export const TARTALOM = { bal: 48, jobb: 595.28 - 48 };        // a tartalom széle (pt), a 48 pt-os margókon belül

/* ---------------------------------------------------------------- tesztadatok */
const ROVID = ['Ínymaszk', 'Műfog', 'Csonkfelépítés', 'Harapási sablon', 'Egyéni kanál', 'Fogsorjavítás', 'Cirkon korona',
  'Fémkerámia korona', 'PMMA ideiglenes korona', 'Öntött csap', 'Rögzítő elem (CAD)', 'Teleszkóp korona', 'Őrlőfog-pótlás',
  'Űrtartó készülék', 'Kapocs'];
export const HOSSZU_NEV = 'cirkon korona implantátumra csavarozva, titánbázissal és egyedi felépítménnyel (frontfog, esztétikai rétegzés, Őrlő Űr)';
export const CSOPORTOK = ['Rögzített pótlások', 'Kombinált munkák', 'Protetika – ő ű'];

// n tétel; minden `hosszuMinden`-edik neve kétsoros; a csoportok egymás után, folyamatosan (a lista sorrendje = a PDF sorrendje)
export function vegyesAdat(n, { hosszuMinden = 10, csoportos = true, orvos = 'Dr. Őry Űrsula', hosszuNev = HOSSZU_NEV } = {}) {
  const tetelek = [];
  for (let i = 1; i <= n; i++) {
    const ssz = String(i).padStart(2, '0');
    const nev = hosszuMinden && i % hosszuMinden === 0 ? `${ssz}. ${hosszuNev}` : `${ROVID[(i - 1) % ROVID.length]} – ${ssz}`;
    const ar = 1000 + Math.round(((i * 7919) % 185000) / 50) * 50;         // 1 000 … 186 000 Ft, ezres tagolással
    tetelek.push([nev, [ar], csoportos ? CSOPORTOK[Math.min(CSOPORTOK.length - 1, Math.floor((i - 1) * CSOPORTOK.length / n))] : '']);
  }
  return adatok({ orvosok: [orvos], tetelek });
}
// mennyiség minden tételre (alapból 1…4 ismétlődve), a valasztas.menny formátumában
export function mindenMenny(adat, f = i => (i % 4) + 1) {
  const m = {}; adat.tetelek.forEach((t, i) => { m[t.id] = f(i); }); return m;
}
// a várt sorok (a PDF sorrendjében, csoportonként) és a végösszeg
export function vartSorok(adat, menny, orvosId = adat.orvosok[0].id) {
  const sorok = [];
  const csoportok = [...new Set(adat.tetelek.map(t => t.csoport || ''))];
  for (const cs of csoportok) for (const t of adat.tetelek.filter(x => (x.csoport || '') === cs)) {
    const db = menny[t.id] || 0; if (!db) continue;
    const ar = adat.arak[t.id][orvosId];
    sorok.push({ nev: t.nev, csoport: t.csoport, menny: db, ar, osszeg: Math.round(db * ar * 100) / 100 });
  }
  return { sorok, vegosszeg: Math.round(sorok.reduce((a, s) => a + s.osszeg, 0) * 100) / 100 };
}

/* ---------------------------------------------------------------- szövegelemzés */
// A pdf.js a szövegkinyeréskor a nem törő szóközt (U+00A0) sima szóközzé alakítja, ezért itt mindkettőt elfogadjuk;
// a nem törő szóköz meglétét a nyers PDF ToUnicode-táblája és a renderelt kép ellenőrzi.
export const SZAM_MINTA = /^-?\d{1,3}(?:[\xA0 ]\d{3})*(?:,\d+)?[\xA0 ](?:db|Ft)$/;
// a látható szövegelemek (üres és csak szóköz elemek nélkül), felülről mért y-nal (yf: az alapvonal a lap tetejétől)
export function elemek(elemzes, oldal = 0) {
  const o = elemzes.oldal[oldal];
  const nevek = [...new Set(o.elemek.map(e => e.font).filter(Boolean))];
  const betuNev = new Map(nevek.map((n, i) => [n, (o.betuk[i] || {}).nev || n]));
  return o.elemek.filter(e => e.s && e.s.trim()).map(e => ({ ...e, jobb: e.x + e.w, yf: o.h - e.y, betu: betuNev.get(e.font) || e.font,
    felkover: /SmBld|SemiBold|Bold|Medium/i.test(betuNev.get(e.font) || '') }));
}
// szövegsorok: az azonos alapvonalú elemek balról jobbra
export function szovegSorok(lista) {
  const sorok = [];
  for (const e of [...lista].sort((a, b) => a.yf - b.yf || a.x - b.x)) {
    const s = sorok.find(r => Math.abs(r.yf - e.yf) < 0.6);
    if (s) s.elemek.push(e); else sorok.push({ yf: e.yf, elemek: [e] });
  }
  for (const s of sorok) {
    s.elemek.sort((a, b) => a.x - b.x);
    s.szoveg = s.elemek.map(e => e.s).join(' ').replace(/\s+/g, ' ').trim();
    s.bal = Math.min(...s.elemek.map(e => e.x)); s.jobb = Math.max(...s.elemek.map(e => e.jobb));
    s.meret = Math.max(...s.elemek.map(e => e.h));
  }
  return sorok.sort((a, b) => a.yf - b.yf);
}
// a teljes oldal szövege a tartalomfolyam sorrendjében, szóközök nélkül (a többsoros nevek így is megtalálhatók)
export const tomorSzoveg = lista => lista.map(e => e.s).join('').replace(/\s+/g, '');
export const tomor = s => String(s).replace(/\s+/g, '');

// a táblázat: fejléc, oszlopok jobb széle, sorok (név, menny, ár, összesen), csoportcímek, végösszeg
export function tabla(elemzes, { csoportok = [] } = {}) {
  const lista = elemek(elemzes);
  const fej = {};
  for (const c of ['Megnevezés', 'Menny.', 'Egységár', 'Összesen']) fej[c] = lista.find(e => e.s === c) || null;
  const vegLabel = lista.find(e => e.s === 'Végösszeg') || null;
  const res = { fej, vegLabel, sorok: [], csoportCimek: [], vegosszeg: null, vegosszegElem: null, szamElemek: [], nevElemek: [] };
  if (!fej['Megnevezés'] || !fej['Összesen']) return res;
  const jobbSzel = { menny: fej['Menny.'] && fej['Menny.'].jobb, ar: fej['Egységár'] && fej['Egységár'].jobb, ossz: fej['Összesen'].jobb };
  res.jobbSzel = jobbSzel;
  const tetoY = fej['Megnevezés'].yf, aljY = vegLabel ? vegLabel.yf - 9 : Infinity;
  const tablaElemek = lista.filter(e => e.yf > tetoY + 0.5 && e.yf < aljY);
  const oszlop = e => {
    if (!SZAM_MINTA.test(e.s)) return null;
    let leg = null, d = Infinity;
    for (const [k, x] of Object.entries(jobbSzel)) if (x != null && Math.abs(e.jobb - x) < d) { d = Math.abs(e.jobb - x); leg = k; }
    return d < 25 ? leg : null;
  };
  let akt = null;
  for (const sor of szovegSorok(tablaElemek)) {
    const szamok = sor.elemek.filter(e => oszlop(e));
    const nevek = sor.elemek.filter(e => !oszlop(e));
    res.szamElemek.push(...szamok); res.nevElemek.push(...nevek);
    const nevSzoveg = nevek.map(e => e.s).join(' ').replace(/\s+/g, ' ').trim();
    if (szamok.length) {
      akt = { yf: sor.yf, nevReszek: nevSzoveg ? [nevSzoveg] : [], nevElemek: [...nevek], meret: sor.meret };
      for (const e of szamok) { const k = oszlop(e); akt[k] = ftSzam(e.s); akt[k + 'Elem'] = e; }
      res.sorok.push(akt);
    } else if (nevek.length && (nevek.every(e => e.felkover) || csoportok.some(c => tomor(c) === tomor(nevSzoveg)))) {
      res.csoportCimek.push({ szoveg: nevSzoveg, yf: sor.yf, elemek: nevek }); akt = null;   // csoportcím: félkövér, szám nélkül
    } else if (akt) { akt.nevReszek.push(nevSzoveg); akt.nevElemek.push(...nevek); }          // a név folytatása a következő sorban
  }
  for (const s of res.sorok) s.nev = s.nevReszek.join(' ').replace(/\s+/g, ' ').trim();
  if (vegLabel) {
    const alatta = lista.filter(e => e.yf > vegLabel.yf + 1 && e.yf < vegLabel.yf + 40 && /Ft$/.test(e.s));
    if (alatta.length) { res.vegosszegElem = alatta[0]; res.vegosszeg = ftSzam(alatta[0].s); }
  }
  return res;
}
// a pdf.js-elemekben a név szóközök nélkül (a sortörés és a kötőjelnél való törés miatt)
export const nevEgyezik = (pdfNev, nev) => tomor(pdfNev) === tomor(nev);

/* ---------------------------------------------------------------- nyers PDF */
// objektumok (szótár + kibontott adatfolyam), betűk (ToUnicode, szélességek, beágyazott fájl), képek
export function pdfNyers(bajtok) {
  const buf = Buffer.from(bajtok);
  const s = buf.toString('latin1');
  const obj = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const id = Number(m[1]);
    let i = m.index + m[0].length;
    const vegObj = s.indexOf('endobj', i);
    const streamPoz = s.indexOf('stream', i);
    let szotar, adat = null, nyersHossz = 0;
    if (streamPoz >= 0 && streamPoz < vegObj && /^\s*<</.test(s.slice(i, i + 20))) {
      szotar = s.slice(i, streamPoz);
      let kezd = streamPoz + 6; if (s[kezd] === '\r') kezd++; if (s[kezd] === '\n') kezd++;
      const hm = szotar.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
      const veg = hm ? kezd + Number(hm[1]) : s.indexOf('endstream', kezd);
      const nyers = buf.subarray(kezd, veg);
      nyersHossz = nyers.length;
      adat = nyers;
      if (/\/Filter\s*\/FlateDecode/.test(szotar)) { try { adat = zlib.inflateSync(nyers); } catch (e) { adat = null; } }
      const vege = s.indexOf('endobj', veg);
      re.lastIndex = vege > 0 ? vege : veg;
    } else {
      szotar = s.slice(i, vegObj);
      re.lastIndex = vegObj > 0 ? vegObj : i;
    }
    obj.set(id, { id, szotar, adat, nyersHossz });
  }
  const ref = (sz, kulcs) => { const r = sz.match(new RegExp('/' + kulcs + '\\s+(\\d+)\\s+\\d+\\s+R')); return r ? obj.get(Number(r[1])) : null; };
  const betuk = [];
  for (const o of obj.values()) {
    if (!/\/Type\s*\/Font\b/.test(o.szotar) || !/\/Subtype\s*\/Type0/.test(o.szotar)) continue;
    const nev = (o.szotar.match(/\/BaseFont\s*\/([^\s/<>[\]]+)/) || [])[1];
    const lm = o.szotar.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
    const leszarmazott = lm ? obj.get(Number(lm[1])) : null;
    const tu = ref(o.szotar, 'ToUnicode');
    const leiro = leszarmazott ? ref(leszarmazott.szotar, 'FontDescriptor') : null;
    const fajl = leiro ? (ref(leiro.szotar, 'FontFile2') || ref(leiro.szotar, 'FontFile3') || ref(leiro.szotar, 'FontFile')) : null;
    betuk.push({
      nev, reszhalmaz: /^[A-Z]{6}\+/.test(nev || ''), beagyazott: !!fajl,
      fajlMeret: fajl ? fajl.nyersHossz : 0, fajlMeretKibontva: fajl && fajl.adat ? fajl.adat.length : 0,
      unicode: tu && tu.adat ? toUnicodeTabla(tu.adat.toString('latin1')) : null,
      szelesseg: leszarmazott ? wTomb(leszarmazott.szotar) : new Map(),
      alapSzelesseg: leszarmazott ? Number((leszarmazott.szotar.match(/\/DW\s+(\d+)/) || [])[1] || 1000) : 1000
    });
  }
  const kepek = [];
  for (const o of obj.values()) {
    if (!/\/Subtype\s*\/Image\b/.test(o.szotar)) continue;
    kepek.push({ id: o.id, szel: Number((o.szotar.match(/\/Width\s+(\d+)/) || [])[1]), mag: Number((o.szotar.match(/\/Height\s+(\d+)/) || [])[1]), meret: o.nyersHossz });
  }
  const oldalak = [...obj.values()].filter(o => /\/Type\s*\/Page(?!s)\b/.test(o.szotar));
  const tartalom = [];
  for (const p of oldalak) {
    const cm = p.szotar.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    const c = cm ? obj.get(Number(cm[1])) : null;
    if (c && c.adat) tartalom.push(c.adat.toString('latin1'));
  }
  return { obj, betuk, kepek, oldalak: oldalak.map(p => ({ mediaBox: (p.szotar.match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1], forgatas: Number((p.szotar.match(/\/Rotate\s+(-?\d+)/) || [])[1] || 0) })), tartalom, meret: buf.length };
}
function hexUnicode(h) {
  let r = '';
  for (let i = 0; i + 4 <= h.length; i += 4) r += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  return r;
}
// ToUnicode CMap → Map(kód → szöveg)
export function toUnicodeTabla(cmap) {
  const t = new Map();
  for (const blokk of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of blokk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) t.set(parseInt(p[1], 16), hexUnicode(p[2]));
  }
  for (const blokk of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blokk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const a = parseInt(p[1], 16), b = parseInt(p[2], 16);
      if (p[3].startsWith('[')) {
        const lista = [...p[3].matchAll(/<([0-9a-fA-F]*)>/g)].map(x => hexUnicode(x[1]));
        for (let k = a; k <= b; k++) t.set(k, lista[k - a]);
      } else {
        const kezd = parseInt(p[3].slice(1, -1), 16);
        for (let k = a; k <= b; k++) t.set(k, String.fromCharCode(kezd + k - a));
      }
    }
  }
  return t;
}
// /W [c [w1 w2 …] c1 c2 w …] → Map(kód → szélesség, 1/1000 em)
function wTomb(szotar) {
  const w = new Map();
  const m = szotar.match(/\/W\s*\[([\s\S]*)\]\s*(?:\/|>>)/);
  if (!m) return w;
  const tok = m[1].match(/\[|\]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0;
  while (i < tok.length) {
    const c = Number(tok[i++]);
    if (tok[i] === '[') {
      i++; let k = c;
      while (i < tok.length && tok[i] !== ']') w.set(k++, Number(tok[i++]));
      i++;
    } else { const c2 = Number(tok[i++]); const ertek = Number(tok[i++]); for (let k = c; k <= c2; k++) w.set(k, ertek); }
  }
  return w;
}
// a tartalomfolyamban kirajzolt jelkódok (Identity-H, 2 bájtos hex szövegek a TJ/Tj műveletekben); a 0 a .notdef,
// vagyis a betűkészletből hiányzó karakter (üres doboz). A ToUnicode-tábla ezt nem mutatja: a 0-s kódot mindig 0000-ra képezi.
export function jelKodok(ny) {
  const kodok = new Set();
  for (const t of ny.tartalom) for (const m of t.matchAll(/<([0-9a-fA-F]{4,})>/g)) for (let i = 0; i + 4 <= m[1].length; i += 4) kodok.add(parseInt(m[1].slice(i, i + 4), 16));
  return kodok;
}
// egy karakter kódja és szélessége egy betűben (a ToUnicode fordítottja)
export function karakter(betu, ch) {
  if (!betu.unicode) return null;
  for (const [kod, u] of betu.unicode) if (u === ch) return { kod, szel: betu.szelesseg.has(kod) ? betu.szelesseg.get(kod) : betu.alapSzelesseg };
  return null;
}

/* ---------------------------------------------------------------- renderelés és képpont-vizsgálat */
// A renderelt oldal a böngészőben marad; a lekérdezések pt-ban (a lap bal felső sarkától) adják meg a területet.
export async function raszter(context, bajtok, { skala = 3, szurke = false } = {}) {
  const p = await context.newPage();
  await p.goto('/tests/pdfnezo.html');
  await p.waitForFunction(() => window.nezoKesz === true);
  const b64 = Buffer.from(bajtok).toString('base64');
  const info = await p.evaluate(async ({ b64, skala, szurke }) => {
    const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: u, isEvalSupported: false }).promise;
    const pg = await doc.getPage(1);
    const vp = pg.getViewport({ scale: skala });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    const kep = cx.getImageData(0, 0, cv.width, cv.height); const d = kep.data;
    const L = new Float32Array(cv.width * cv.height);
    let tinta = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      L[j] = l; tinta += 1 - l;
      if (szurke) { const v = Math.round(l * 255); d[i] = d[i + 1] = d[i + 2] = v; }
    }
    if (szurke) cx.putImageData(kep, 0, 0);
    const R = { w: cv.width, h: cv.height, skala, d, L };
    const px = (x, y) => [Math.max(0, Math.min(R.w - 1, Math.round(x * skala))), Math.max(0, Math.min(R.h - 1, Math.round(y * skala)))];
    const zold = i => d[i + 1] > d[i] + 40 && d[i + 1] > d[i + 2] + 5;                 // a #2F7D6D és a vele kevert szélek
    const kromatikus = i => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40;
    // egy terület statisztikája
    R.regio = (x0, y0, x1, y1, kuszob = 0.75) => {
      const [a, b] = px(x0, y0), [c, e] = px(x1, y1);
      let n = 0, feher = 0, zoldDb = 0, kromDb = 0, sum = 0, tintaDb = 0, rs = 0, gs = 0, bs = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
      for (let y = b; y < e; y++) for (let x = a; x < c; x++) {
        const j = y * R.w + x, i = j * 4, l = L[j]; n++; sum += l;
        if (l > 0.94) feher++;
        if (zold(i)) zoldDb++;
        if (kromatikus(i)) kromDb++;
        if (l < kuszob) { tintaDb++; rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      return { n, feher: feher / n, zold: zoldDb / n, zoldDb, kromatikus: kromDb / n, kromDb, atlagL: sum / n, tinta: 1 - sum / n, tintaDb,
        tintaSzin: tintaDb ? [rs / tintaDb, gs / tintaDb, bs / tintaDb] : null,
        tintaDoboz: tintaDb ? { x0: minX / skala, y0: minY / skala, x1: (maxX + 1) / skala, y1: (maxY + 1) / skala } : null };
    };
    // fehér képpontok elárasztása egy pontból (4-szomszédság), a kerethez érés figyelésével
    R.araszt = (x, y, keret, kuszob = 0.9) => {
      const [sx, sy] = px(x, y); const [k0, k1] = px(keret.x0, keret.y0); const [k2, k3] = px(keret.x1, keret.y1);
      if (L[sy * R.w + sx] <= kuszob) return { db: 0, kezdoFeher: false };
      const latott = new Uint8Array(R.w * R.h); const sor = [sy * R.w + sx]; latott[sor[0]] = 1;
      let db = 0, kilog = false, minX = sx, maxX = sx, minY = sy, maxY = sy; const szegely = new Map();
      while (sor.length) {
        const j = sor.pop(); db++;
        const x0 = j % R.w, y0 = (j - x0) / R.w;
        if (x0 <= k0 || x0 >= k2 || y0 <= k1 || y0 >= k3) { kilog = true; break; }
        if (x0 < minX) minX = x0; if (x0 > maxX) maxX = x0; if (y0 < minY) minY = y0; if (y0 > maxY) maxY = y0;
        for (const n of [j - 1, j + 1, j - R.w, j + R.w]) {
          if (latott[n]) continue; latott[n] = 1;
          if (L[n] > kuszob) sor.push(n); else szegely.set(n, 1);
        }
      }
      let zoldSz = 0, sotet = 0, rs = 0, gs = 0, bs = 0;
      for (const n of szegely.keys()) { if (zold(n * 4)) zoldSz++; if (L[n] < 0.6) sotet++; rs += d[n * 4]; gs += d[n * 4 + 1]; bs += d[n * 4 + 2]; }
      const k = szegely.size || 1;
      return { db, kezdoFeher: true, kilog, terulet: db / (skala * skala), doboz: { x0: minX / skala, y0: minY / skala, x1: (maxX + 1) / skala, y1: (maxY + 1) / skala },
        szegelyDb: szegely.size, szegelyZold: zoldSz / k, szegelySotet: sotet / k, szegelySzin: [rs / k, gs / k, bs / k] };
    };
    // soronkénti átlagos fénysűrűség egy sávban (y0…y1, x0…x1)
    R.sorok = (x0, y0, x1, y1) => {
      const [a, b] = px(x0, y0), [c, e] = px(x1, y1); const r = [];
      for (let y = b; y < e; y++) { let s = 0; for (let x = a; x < c; x++) s += L[y * R.w + x]; r.push({ y: y / skala, L: s / (c - a) }); }
      return r;
    };
    // egy terület kivágása PNG-be (a mentett képekhez), nagyítva
    R.kivag = (x0, y0, x1, y1) => {
      const [a, b] = px(x0, y0), [c, e] = px(x1, y1);
      const k = document.createElement('canvas'); k.width = c - a; k.height = e - b;
      k.getContext('2d').drawImage(cv, a, b, c - a, e - b, 0, 0, c - a, e - b);
      return k.toDataURL('image/png');
    };
    window.__R = R;
    return { w: cv.width, h: cv.height, atlagTinta: tinta / (cv.width * cv.height), png: cv.toDataURL('image/png') };
  }, { b64, skala, szurke });
  return {
    ...info, png: Buffer.from(info.png.split(',')[1], 'base64'),
    regio: (x0, y0, x1, y1, kuszob) => p.evaluate(a => window.__R.regio(...a), [x0, y0, x1, y1, kuszob]),
    araszt: (x, y, keret, kuszob) => p.evaluate(a => window.__R.araszt(...a), [x, y, keret, kuszob]),
    sorok: (x0, y0, x1, y1) => p.evaluate(a => window.__R.sorok(...a), [x0, y0, x1, y1]),
    kivag: async (x0, y0, x1, y1) => Buffer.from((await p.evaluate(a => window.__R.kivag(...a), [x0, y0, x1, y1])).split(',')[1], 'base64'),
    zar: () => p.close()
  };
}

// a logó-sablon (index.html, <template id="logo-…">) mértani adatai a böngészőben: a viewBox és a festett rész befoglalója,
// valamint az Á csoport (<g>) befoglalója, mind a viewBox egységeiben
export async function logoGeometria(page, sablon = 'logo-szines') {
  return page.evaluate(id => {
    const t = document.getElementById(id);
    const svg = t.content.querySelector('svg').cloneNode(true);
    const vb = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    svg.setAttribute('width', String(vb[2])); svg.setAttribute('height', String(vb[3]));
    const tarto = document.createElement('div'); tarto.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden';
    tarto.append(svg); document.body.append(tarto);
    try {
      const bb = svg.getBBox();
      const g = svg.querySelector('g');
      const gr = g.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      const k = vb[2] / sr.width;
      return { viewBox: vb, festett: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
        a: { x: vb[0] + (gr.left - sr.left) * k, y: vb[1] + (gr.top - sr.top) * k, w: gr.width * k, h: gr.height * k } };
    } finally { tarto.remove(); }
  }, sablon);
}

/* ---------------------------------------------------------------- futtatás és kimenet */
// Más adatokkal újranyitja UGYANAZT a lapot (a tárolóba írva, majd újratöltve). Második lapot szándékosan nem nyitunk:
// az alkalmazás a „storage” eseményre a másik lap állapotát átveszi és visszaírja, ami összekeverné a tesztadatokat.
export async function ujraNyit(page, { adat, valasztas }) {
  await page.evaluate(([ka, a, kv, v]) => { localStorage.setItem(ka, JSON.stringify(a)); localStorage.setItem(kv, JSON.stringify(v)); },
    [KULCS.adatok, adat, KULCS.valasztas, valasztas]);
  await page.reload();
  await kesz(page);
}
export function mentKep(testInfo, nev, png) {
  const ut = kimenetUt('pdf', testInfo.project.name, nev);
  fs.writeFileSync(ut, png);
  return ut;
}
export function mentFajl(testInfo, nev, tartalom) {
  const ut = kimenetUt('pdf', testInfo.project.name, nev);
  fs.writeFileSync(ut, tartalom);
  return ut;
}
export const median = t => { const s = [...t].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : null; };

// WebKitben a közös tesztkeret (segito.js) context.route-ja a blob: címeket is elfogja és megszakítja: az alkalmazás ilyenkor
// a beágyazott szkriptes tartalékra vált, egy blob:-os Web Worker pedig el sem indulna. Ez a lapon visszaengedi őket,
// így a WebKit is a valódi (Safari) utat járja. Chromiumban a blob: kérés nem jut el az elfogóig, ott hatástalan.
export async function blobEnged(page) {
  // a közös keret (segito.js) 1.7.0 óta csak a http(s) kéréseket fogja el, a blob: címek szabadon mennek; a WebKit
  // page.route-ja a blob:-os Worker betöltését is megzavarhatja („access control checks”), ezért itt már nincs teendő
  void page;
}

// Lassú telefon szimulálása minden motorban: a pdfmake minden oldalszámítása 1,5 s-ig foglalja a fő szálat.
// Ha a PDF már nem a fő szálon készül (pl. Web Workerben — a TEL-03 javítása), a fő szálon nincs mit lassítani:
// ilyenkor a window.pdfMake hiányzik vagy nem hívódik; a hívások száma a window.__lassitasDb-ben (a teszt ehhez igazítja
// a „valóban lassú volt” ellenőrzést). Vissza: be lett-e szerelve a lassítás.
export const LASSU_PDFMAKE = () => {
  window.__lassitasDb = 0;
  const pm = window.pdfMake;
  if (!pm || typeof pm.createPdf !== 'function') return false;
  const eredeti = pm.createPdf.bind(pm);
  pm.createPdf = (...a) => { window.__lassitasDb++; const t = performance.now(); while (performance.now() - t < 1500) { /* foglalt */ } return eredeti(...a); };
  return true;
};

// CPU-lassítás (csak Chromium, CDP); a többi motorban null
export async function cpuLassit(page, browserName, rate = 4) {
  if (browserName !== 'chromium') return null;
  const s = await page.context().newCDPSession(page);
  await s.send('Emulation.setCPUThrottlingRate', { rate });
  return s;
}

// a CDN-fájlok mérete (a tesztkeret helyi másolatából) — a lapsúly-méréshez
export function cdnMeret(url) {
  const h = cachePath(url.split('?')[0]);
  return fs.existsSync(h) ? fs.statSync(h).size : null;
}
export { CDN_MINTA, tipus };
export const brotliMeret = buf => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }).length;
export const gzipMeret = buf => zlib.gzipSync(buf, { level: 9 }).length;
export { path };
