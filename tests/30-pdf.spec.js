// PDF-tesztek: oldalszám és A4, túlcsordulás és figyelmeztetés, betűk és ékezetek, kijelölhető (vektoros) szöveg,
// logó (élesség, arány, a fog az Á-ban), számok igazítása, hosszú nevek, végösszeg, egyszínű logó, szürkeárnyalatos nyomtatás.
// A renderelt oldalak: tests/kimenet/pdf/<projekt>/… (a képeket érdemes szemmel is megnézni).
import { test, expect, nyit, adatok, sokTetel, letoltes, pdfElemez, pdfKep, pdfBetuk, pdfOldalSzam, pdfKozvetlen, osszegSzoveg, ftSzam, kimenetUt, KULCS } from './segito.js';
import {
  A4, TARTALOM, CSOPORTOK, vegyesAdat, mindenMenny, vartSorok, tabla, elemek, szovegSorok, tomor, tomorSzoveg,
  pdfNyers, jelKodok, karakter, raszter, logoGeometria, mentKep, mentFajl, ujraNyit
} from './segito-pdf.js';

const IDO = '2026-10-10T09:00:00';
const NBSP = String.fromCharCode(0xA0);
const LOGO = { szel: 127.56, bal: 48, fent: 44 };             // 45 mm széles logódoboz a bal felső margónál (a terv szerint)

async function megnyit(page, adat, menny, extra = {}) {
  await nyit(page, { adat, valasztas: { orvosId: adat.orvosok[0].id, menny, datum: null }, ido: IDO, ...extra });
}
async function pdfFeluletrol(page, adat, menny, extra = {}) {
  await megnyit(page, adat, menny, extra);
  return letoltes(page);
}
const bajt = r => Buffer.from(r.b64, 'base64');
// a kiválasztott tételek első k darabja (a lista sorrendjében) ugyanazzal a mennyiséggel
const elsoK = (adat, menny, k) => { const m = {}; adat.tetelek.slice(0, k).forEach(t => { if (menny[t.id]) m[t.id] = menny[t.id]; }); return m; };
// ugyanazon a lapon, más mennyiségekkel, felület nélkül: { tulcsordul, oldalak, elfer, szint, bajtok }
async function kozvetlen(page, adat, menny) {
  await ujraNyit(page, { adat, valasztas: { orvosId: adat.orvosok[0].id, menny, datum: null } });
  const r = await pdfKozvetlen(page);
  return { ...r, bajtok: bajt(r) };
}

/* ======================================================================
   1. Oldalszám, A4 álló, tartalom — 1, 4, 15, 30, 40 tétel
   ====================================================================== */
test.describe('oldalszám és A4', () => {
  for (const n of [1, 4, 15, 30, 40]) {
    test(`${n} tétel: pontosan egy A4-es álló oldal, minden tétel, a sor- és a végösszeg helyes`, async ({ page, context }, testInfo) => {
      // vegyes nevek (rövid, kétsoros, ékezetes), 3 csoport, ezres tagolású árak; 40 tételnél csak egysoros nevek (így még elfér)
      const adat = vegyesAdat(n, { hosszuMinden: n >= 40 ? 0 : 10 });
      const menny = mindenMenny(adat);
      const vart = vartSorok(adat, menny);
      await megnyit(page, adat, menny);
      expect(ftSzam((await osszegSzoveg(page)).split(',').slice(1).join(',')), 'a sáv végösszege').toBe(vart.vegosszeg);

      const { nev, bajtok } = await letoltes(page);
      expect(nev).toMatch(/^Arlista_.+_2026-10-10\.pdf$/);
      expect(pdfOldalSzam(bajtok), 'oldalak száma a nyers PDF-ben').toBe(1);
      const ny = pdfNyers(bajtok);
      expect(ny.oldalak).toHaveLength(1);
      expect(ny.oldalak[0].mediaBox.trim().split(/\s+/).map(Number), 'MediaBox = A4 (595,28 × 841,89 pt)').toEqual([0, 0, 595.28, 841.89]);
      expect(ny.oldalak[0].forgatas, 'nincs elforgatva').toBe(0);
      expect(jelKodok(ny).has(0), 'nincs hiányzó jel (.notdef doboz) a szövegben').toBe(false);

      const e = await pdfElemez(context, bajtok);
      expect(e.oldalak).toBe(1);
      expect(e.oldal[0].w).toBeCloseTo(A4.w, 1);
      expect(e.oldal[0].h).toBeCloseTo(A4.h, 1);
      expect(e.oldal[0].h, 'álló tájolás').toBeGreaterThan(e.oldal[0].w);

      const t = tabla(e, { csoportok: CSOPORTOK });
      expect(t.sorok.map(s => tomor(s.nev)), 'minden tétel szerepel, a lista sorrendjében').toEqual(vart.sorok.map(s => tomor(s.nev)));
      expect(t.sorok.map(s => [s.menny, s.ar, s.ossz]), 'mennyiség, egységár, összesen soronként').toEqual(vart.sorok.map(s => [s.menny, s.ar, s.osszeg]));
      expect(t.vegosszeg, 'végösszeg').toBe(vart.vegosszeg);
      expect(t.csoportCimek.map(c => c.szoveg), 'csoportcímek').toEqual([...new Set(vart.sorok.map(s => s.csoport))]);

      // betűméret: 10 pt-tól legfeljebb 7,5 pt-ig; kevés tételnél a legnagyobb
      const meretek = t.sorok.map(s => s.meret);
      expect(Math.min(...meretek)).toBeGreaterThanOrEqual(7.5 - 0.01);
      expect(Math.max(...meretek)).toBeLessThanOrEqual(10 + 0.01);
      if (n <= 15) expect(Math.min(...meretek)).toBeCloseTo(10, 1);
      testInfo.annotations.push({ type: 'betűméret', description: `${n} tétel: ${meretek[0].toFixed(2)} pt` });

      // minden szöveg a 48 pt-os margókon belül és a lapon
      for (const el of elemek(e)) {
        expect(el.x, `„${el.s}” bal széle`).toBeGreaterThanOrEqual(TARTALOM.bal - 0.5);
        expect(el.jobb, `„${el.s}” jobb széle`).toBeLessThanOrEqual(TARTALOM.jobb + 0.5);
        expect(el.yf).toBeGreaterThan(0); expect(el.yf).toBeLessThan(A4.h);
      }
      // a fejléc jobb oldala (Árlista, dátum, sorszám) a jobb margóhoz igazítva
      const sorok = szovegSorok(elemek(e));
      for (const minta of [/^Árlista$/, /^2026\.10\.10\.$/, /^Sorszám: 20261010-01$/]) {
        const s = sorok.find(x => minta.test(x.szoveg));
        expect(s, `fejléc: ${minta}`).toBeTruthy();
        expect(Math.abs(s.jobb - TARTALOM.jobb)).toBeLessThan(0.5);
      }
      if ([1, 15, 40].includes(n)) {
        const k = await pdfKep(context, bajtok, { skala: 2 });
        mentKep(testInfo, `oldal_${String(n).padStart(2, '0')}_tetel.png`, k.png);
        mentFajl(testInfo, `oldal_${String(n).padStart(2, '0')}_tetel.pdf`, bajtok);
      }
    });
  }
});

/* ======================================================================
   2. Túlcsordulás: 60 tétel, és ahol a határ van (rövid és hosszú nevekkel)
   ====================================================================== */
test.describe('túlcsordulás', () => {
  test('60 tétel: nem fér el — figyelmeztetés a sávban és párbeszédablakban, nincs letöltés, a sorszám nem fogy, a „legfeljebb N” pontos', async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    const adat = vegyesAdat(60);
    const menny = mindenMenny(adat);
    await megnyit(page, adat, menny);
    const sav = page.locator('#savUzenet');
    await expect(sav, 'a háttérben elkészült PDF túlcsordul: a sáv szól').toBeVisible({ timeout: 90_000 });
    await expect(sav).toContainText(/60\s*tétel nem fér el egy A4-es oldalon \(legfeljebb \d+ fér el\)/);
    const N = Number((await sav.innerText()).match(/legfeljebb (\d+) fér el/)[1]);
    const sorszamElotte = await page.evaluate(() => window.dentAl.sorszamKovetkezo('20261010'));

    const letoltesek = [];
    page.on('download', d => letoltesek.push(d.suggestedFilename()));
    await page.locator('#letoltGomb').click();
    const dlg = page.locator('#dlg');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#dlgCim')).toHaveText('Nem fér el egy oldalon');
    await expect(dlg.locator('#dlgLeiras')).toContainText(/60\s*tétel nem fér el egy A4-es oldalon/);
    await expect(dlg.locator('#dlgLeiras')).toContainText(`legfeljebb ${N} fér el`);
    await page.screenshot({ path: kimenetUt('pdf', testInfo.project.name, '60_tetel_parbeszed.png') });
    await page.waitForTimeout(1500);                  // negatív próba: ennyi idő alatt sem indulhat letöltés
    expect(letoltesek, 'túlcsordulásnál nincs letöltés').toEqual([]);
    await expect(page.locator('#savKesz')).toBeHidden();
    expect(await page.evaluate(() => window.dentAl.sorszamKovetkezo('20261010')), 'a sorszám nem fogyott').toBe(sorszamElotte);
    await dlg.getByRole('button', { name: 'Rendben' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.locator('#osszeg'), 'a mennyiségek megmaradtak').toContainText(/60\s*tétel/);

    // a kiírt szám helyes: az első N tétel egy oldalon elfér, N+1 már nem
    const elfer = await kozvetlen(page, adat, elsoK(adat, menny, N));
    expect(elfer.tulcsordul, `${N} tétel elfér`).toBe(false);
    expect(pdfOldalSzam(elfer.bajtok)).toBe(1);
    const tobb = await kozvetlen(page, adat, elsoK(adat, menny, N + 1));
    expect(tobb.tulcsordul, `${N + 1} tétel már nem fér el`).toBe(true);
    expect(tobb.elfer).toBe(N);
    testInfo.annotations.push({ type: 'mérés', description: `60 vegyes tétel (3 csoport, minden 10. név kétsoros): legfeljebb ${N} fér el` });
  });

  for (const [cim, adatFv, minN] of [
    ['rövid, egysoros nevek, csoport nélkül', n => sokTetel(n), 40],
    ['hosszú, két-háromsoros nevek', n => vegyesAdat(n, { hosszuMinden: 1, csoportos: false }), 15]
  ]) {
    test(`a túlcsordulás határa (${cim}): N tétel még elfér a legkisebb betűvel, N+1 már nem, és a figyelmeztetés N-et mond`, async ({ page, context }, testInfo) => {
      test.setTimeout(150_000);
      const adat = adatFv(60);
      const menny = mindenMenny(adat, () => 1);
      await megnyit(page, adat, menny);
      const r60 = await pdfKozvetlen(page);
      expect(r60.tulcsordul).toBe(true);
      expect(r60.oldalak).toBeGreaterThan(1);
      const N = r60.elfer;
      expect(N, 'legalább ennyi tételnek el kell férnie').toBeGreaterThanOrEqual(minN);
      expect(N).toBeLessThan(60);
      const elfer = await kozvetlen(page, adat, elsoK(adat, menny, N));
      expect(elfer.tulcsordul).toBe(false);
      expect(elfer.oldalak).toBe(1);
      expect(elfer.szint, 'a legkisebb (7,5 pt-os) fokozaton').toBe(10);
      const tobb = await kozvetlen(page, adat, elsoK(adat, menny, N + 1));
      expect(tobb.tulcsordul).toBe(true);
      expect(tobb.elfer).toBe(N);
      const k = await pdfKep(context, elfer.bajtok, { skala: 2 });
      mentKep(testInfo, `hatar_${minN === 40 ? 'rovid' : 'hosszu'}_${N}_tetel.png`, k.png);
      testInfo.annotations.push({ type: 'mérés', description: `${cim}: legfeljebb ${N} tétel fér el egy oldalon` });
      console.log(`[mérés] ${testInfo.project.name} – ${cim}: legfeljebb ${N} tétel fér el`);
    });
  }
});

/* ======================================================================
   3. Betűk: beágyazás, ékezetek (ő ű Ő Ű á é), nem törő szóköz
   ====================================================================== */
const ORVOS = 'Dr. Őry Űrsula Éva';
const EKEZETES = ['Őrlőfog – ű Ű á é', 'Áthidaló tag ÁÉÍÓÖŐÚÜŰ', 'Fogsorjavítás áéíóöőúüű'];
const LABJEGYZET = 'Űrlap: ő ű Ő Ű á é – az árak forintban értendők.';
test.describe('betűk és ékezetek', () => {
  test('minden betű beágyazott részhalmaz; ő ű Ő Ű á é helyes a tételnévben, a címzettben és a lábjegyzetben; a nem törő szóköznek saját (üres) jele van', async ({ page, context }, testInfo) => {
    const adat = adatok({ orvosok: [ORVOS], tetelek: [[EKEZETES[0], [12345]], [EKEZETES[1], [1234567]], [EKEZETES[2], [990]]] });
    const menny = { t1: 3, t2: 1, t3: 2 };
    const { bajtok } = await pdfFeluletrol(page, adat, menny, { config: { pdfLabjegyzet: LABJEGYZET } });

    // pdffonts-szerű lista: minden betű beágyazott, részhalmaz (ABCDEF+név)
    const lista = pdfBetuk(bajtok);
    expect(lista.length).toBeGreaterThan(0);
    for (const b of lista) { expect(b.beagyazott, `${b.nev} beágyazott`).toBe(true); expect(b.reszhalmaz, `${b.nev} részhalmaz`).toBe(true); }
    const e = await pdfElemez(context, bajtok);
    for (const b of e.oldal[0].betuk) expect(b.beagyazott, `pdf.js: ${b.nev}`).toBe(true);

    // a nyers betűk: beágyazott fájl, ToUnicode-tábla; a szövegben nincs .notdef (0-s kódú, hiányzó) jel
    const ny = pdfNyers(bajtok);
    expect(jelKodok(ny).has(0), 'nincs hiányzó jel (.notdef doboz) a szövegben').toBe(false);
    const osszesKar = new Set();
    for (const b of ny.betuk) {
      expect(b.beagyazott, `${b.nev}: FontFile2`).toBe(true);
      expect(b.unicode, `${b.nev}: ToUnicode`).toBeTruthy();
      for (const u of b.unicode.values()) for (const c of u) osszesKar.add(c);
    }
    for (const c of ['ő', 'ű', 'Ő', 'Ű', 'á', 'é', NBSP]) expect(osszesKar.has(c), `a „${c === NBSP ? 'NBSP' : c}” karakternek saját jele van`).toBe(true);
    // a nem törő szóköz jele: nem a .notdef, és ugyanolyan széles, mint a szóköz
    for (const b of ny.betuk) {
      const nb = karakter(b, NBSP), sp = karakter(b, ' ');
      if (!nb) continue;
      expect(nb.kod, `${b.nev}: NBSP kódja`).not.toBe(0);
      if (sp) expect(nb.szel, `${b.nev}: NBSP szélessége = szóköz szélessége`).toBe(sp.szel);
    }

    // a kinyert szöveg (Unicode) pontos
    const t = tabla(e);
    expect(t.sorok.map(s => s.nev)).toEqual(EKEZETES);
    const sorok = szovegSorok(elemek(e));
    expect(sorok.find(s => s.szoveg.startsWith('Címzett:'))?.szoveg, 'címzett sor').toBe(`Címzett: ${ORVOS}`);
    const lab = elemek(e).filter(x => x.yf > A4.h - 80);
    expect(tomorSzoveg(lab), 'lábjegyzet').toContain(tomor(LABJEGYZET));
    expect(e.info.Title, 'a PDF címe (metaadat)').toContain(ORVOS);
    // összegek a nem törő szóközzel tagolva (a pdf.js a kinyeréskor szóközzé alakítja, ezért a számot nézzük)
    expect(t.sorok.map(s => s.ar)).toEqual([12345, 1234567, 990]);

    // renderelve: az „12 345 Ft” két nem törő szóközének helyén nincs rajzolt jel (nem hiányzó-jel doboz), a számjegyeknél van
    const reg = ny.betuk.find(b => !/SmBld|SemiBold|Bold|Medium/i.test(b.nev));
    const elem = t.sorok[0].arElem;
    const fs_ = elem.h;
    const szoveg = ['1', '2', NBSP, '3', '4', '5', NBSP, 'F', 't'];
    const szel = szoveg.map(c => { const k = karakter(reg, c); expect(k, `a(z) ${c === NBSP ? 'NBSP' : c} jel a betűben`).toBeTruthy(); return k.szel * fs_ / 1000; });
    expect(szel.reduce((a, b) => a + b, 0), 'a szélességek összege = a szövegelem szélessége').toBeCloseTo(elem.w, 0);
    const R = await raszter(context, bajtok, { skala: 6 });
    try {
      let x = elem.x;
      const helyek = szoveg.map((c, i) => { const h = { c, x0: x, x1: x + szel[i] }; x += szel[i]; return h; });
      for (const h of helyek) {
        const belso = (h.x1 - h.x0) * 0.2;
        const r = await R.regio(h.x0 + belso, elem.yf - 0.72 * fs_, h.x1 - belso, elem.yf - 0.05 * fs_, 0.75);
        if (h.c === NBSP) expect(r.tintaDb, 'a nem törő szóköz helye üres').toBe(0);
        else if (/\d/.test(h.c)) expect(r.tintaDb, `a(z) „${h.c}” számjegy kirajzolva`).toBeGreaterThan(0);
      }
      mentKep(testInfo, 'nbsp_12_345_Ft_x6.png', await R.kivag(elem.x - 4, elem.yf - 12, elem.jobb + 4, elem.yf + 4));
    } finally { await R.zar(); }
  });
});

// Az IBM Plex Sansban nincs: emoji (👑, bőrszín-módosítóval 👍🏽), ⌀ (U+2300, átmérő-jel). Benne van: ® ™ ≥ ½ Ø.
// (Az ellenőrzés kiegészítette: a ® és ™ a betűben megvan, nem tűnhet el — egy \p{Extended_Pictographic}-szűrő ezeket is
// törölné, a ⌀-t és a bőrszín-módosítót viszont benne hagyná; az orvos neve a „Címzett” sorba kerül, ott sem lehet doboz.)
test('[PDF-02] a betűkészletben nem szereplő karakter (pl. telefonon beírt emoji, ⌀) nem jelenik meg üres dobozként a PDF-ben, a betűben meglévő jelek (® ™ ≥ ½ Ø) megmaradnak', async ({ page, context }, testInfo) => {
  const NEV = 'Híd 👑 tag';
  const MEGLEVO = 'Ív ≥ 2 mm ½ Ø – IPS e.max® ™';
  const adat = adatok({ orvosok: ['Dr. Kiss Ádám 👍🏽'], tetelek: [[NEV, [25000]], ['Implantátum ⌀ 4,1 mm', [56000]], [MEGLEVO, [1000]]] });
  const { bajtok } = await pdfFeluletrol(page, adat, { t1: 1, t2: 1, t3: 2 });
  mentKep(testInfo, 'emoji_a_nevben.png', (await pdfKep(context, bajtok, { skala: 3 })).png);
  expect(jelKodok(pdfNyers(bajtok)).has(0), 'nincs hiányzó jel (.notdef doboz) a szövegben').toBe(false);
  const e = await pdfElemez(context, bajtok);
  const t = tabla(e);
  expect(t.sorok).toHaveLength(3);
  expect(t.sorok[0].nev, 'a név többi része megmarad').toMatch(/^Híd\s.*tag$/);
  expect(t.sorok[1].nev, 'a név többi része megmarad').toMatch(/^Implantátum\s.*4,1 mm$/);
  for (const s of t.sorok) expect(s.nev).not.toContain(String.fromCharCode(0));
  expect(t.sorok.map(s => s.ar), 'az árak változatlanok').toEqual([25000, 56000, 1000]);
  expect(t.sorok[2].nev, 'a betűkészletben meglévő jelek (≥ ½ Ø ® ™) maradnak').toBe(MEGLEVO);
  const cimzett = szovegSorok(elemek(e)).find(s => s.szoveg.startsWith('Címzett:'));
  expect(cimzett && cimzett.szoveg, 'a címzett neve megmarad').toMatch(/^Címzett: Dr\. Kiss Ádám\b/);
});

/* ======================================================================
   4. Kijelölhető, kereshető (vektoros) szöveg, nincs teljes oldalas kép
   ====================================================================== */
test('a szöveg vektoros (kijelölhető, kereshető): minden látható felirat szövegként van benne, kép nincs', async ({ page, context }) => {
  const adat = vegyesAdat(15);
  const menny = mindenMenny(adat);
  const KONFIG = { cim: '1234 Próbaváros, Őz utca 1.', telefon: '+36 1 234 5678', email: 'proba@pelda.hu', pdfLabjegyzet: 'Köszönjük a megrendelést.' };
  const { bajtok } = await pdfFeluletrol(page, adat, menny, { config: KONFIG });
  const ny = pdfNyers(bajtok);
  expect(ny.kepek, 'nincs képobjektum (/Subtype /Image): a logó és a szöveg vektoros').toEqual([]);
  const folyam = ny.tartalom.join('\n');
  expect((folyam.match(/\bBT\b/g) || []).length, 'szövegobjektumok (BT … ET)').toBeGreaterThan(15);
  expect(folyam).toMatch(/\bTJ\b|\bTj\b/);
  for (const b of ny.betuk) expect(b.unicode, `${b.nev}: ToUnicode (másolás, keresés)`).toBeTruthy();

  const e = await pdfElemez(context, bajtok);
  const lista = elemek(e);
  const egesz = tomorSzoveg(lista);
  const vart = vartSorok(adat, menny);
  const feliratok = ['Árlista', '2026.10.10.', 'Sorszám: 20261010-01', 'Címzett: Dr. Őry Űrsula', 'Megnevezés', 'Menny.', 'Egységár', 'Összesen',
    'Végösszeg', KONFIG.cim, KONFIG.telefon, KONFIG.email, KONFIG.pdfLabjegyzet, 'Az árlista 2026.11.09-ig érvényes', '1/1 oldal', ...CSOPORTOK,
    ...vart.sorok.map(s => s.nev)];
  for (const f of feliratok) expect(egesz, `kereshető: „${f}”`).toContain(tomor(f));
});

/* ======================================================================
   5. Logó: vektoros, nem torzult, a fog fehér a zöld Á-ban
   ====================================================================== */
async function logoEllenoriz(page, context, bajtok, testInfo, { mono, nev }) {
  const geo = await logoGeometria(page, mono ? 'logo-mono' : 'logo-szines');
  const [vbx, vby, vbw] = geo.viewBox;
  const s = LOGO.szel / vbw;
  const pt = (x, y) => [LOGO.bal + (x - vbx) * s, LOGO.fent + (y - vby) * s];
  const [fx0, fy0] = pt(geo.festett.x, geo.festett.y), [fx1, fy1] = pt(geo.festett.x + geo.festett.w, geo.festett.y + geo.festett.h);
  const [ax0, ay0] = pt(geo.a.x, geo.a.y), [ax1, ay1] = pt(geo.a.x + geo.a.w, geo.a.y + geo.a.h);
  expect(pdfNyers(bajtok).kepek, 'a logó vektoros (nincs képobjektum)').toEqual([]);
  const R = await raszter(context, bajtok, { skala: 4 });
  try {
    const logo = await R.regio(LOGO.bal - 8, LOGO.fent - 8, LOGO.bal + LOGO.szel + 20, fy1 + 4, 0.75);
    const d = logo.tintaDoboz;
    expect(d, 'a logó kirajzolódott').toBeTruthy();
    // helyzet és méret (±1 pt), arány (±1,5%): nem torzult
    expect(Math.abs(d.x0 - fx0), 'bal szél').toBeLessThan(1);
    expect(Math.abs(d.y0 - fy0), 'felső szél').toBeLessThan(1);
    expect(Math.abs(d.x1 - fx1), 'jobb szél').toBeLessThan(1);
    expect(Math.abs(d.y1 - fy1), 'alsó szél').toBeLessThan(1);
    const arany = ((d.x1 - d.x0) / (d.y1 - d.y0)) / (geo.festett.w / geo.festett.h);
    expect(Math.abs(arany - 1), `szélesség/magasság arány a sablonhoz képest: ${arany.toFixed(4)}`).toBeLessThan(0.015);
    // az Á: színesben zöld, egyszínűben nincs zöld (a sötétkék tintaszín)
    const a = await R.regio(ax0, ay0, ax1, ay1, 0.75);
    if (mono) {
      expect(logo.zoldDb, 'egyszínű logóban nincs zöld képpont').toBe(0);
      const [r, g, b] = logo.tintaSzin;
      expect(b, 'a tinta sötétkék (#1E3A4C)').toBeGreaterThan(g);
      expect(Math.max(Math.abs(r - 0x1E), Math.abs(g - 0x3A), Math.abs(b - 0x4C)), `tintaszín: ${logo.tintaSzin.map(Math.round)}`).toBeLessThan(30);
    } else {
      expect(a.zold, 'a színes logó Á-ja zöld').toBeGreaterThan(0.3);
    }
    // a fog: az Á közepéből elárasztva zárt, fehér terület (nem folyik ki a lap hátterébe), a szegélye az Á színe
    const fog = await R.araszt(ax0 + (ax1 - ax0) * 0.5, ay0 + (ay1 - ay0) * 0.52, { x0: ax0, y0: ay0, x1: ax1, y1: ay1 }, 0.9);
    expect(fog.kezdoFeher, 'a fog közepe fehér').toBe(true);
    expect(fog.kilog, 'a fog zárt kivágás az Á-ban').toBe(false);
    const aranyFog = fog.terulet / ((ax1 - ax0) * (ay1 - ay0));
    expect(aranyFog, `a fog területe az Á befoglalójához képest: ${aranyFog.toFixed(3)}`).toBeGreaterThan(0.04);
    expect(aranyFog).toBeLessThan(0.3);
    const [sr, sg, sb] = fog.szegelySzin;
    if (mono) expect(sb, 'a fog szegélye sötétkék').toBeGreaterThanOrEqual(sg);
    else { expect(sg - sr, 'a fog szegélye zöld').toBeGreaterThan(15); expect(sg).toBeGreaterThan(sb); }
    mentKep(testInfo, `${nev}_logo_x4.png`, await R.kivag(LOGO.bal - 8, LOGO.fent - 8, LOGO.bal + LOGO.szel + 20, fy1 + 6));
    return { tintaDoboz: d, arany, fogArany: aranyFog };
  } finally { await R.zar(); }
}

test.describe('logó', () => {
  test('a színes logó vektoros, nem torzult, a helyén van (45 mm), és a fog fehéren látszik a zöld Á-ban', async ({ page, context }, testInfo) => {
    const adat = adatok();
    const { bajtok } = await pdfFeluletrol(page, adat, { t1: 2 });
    const m = await logoEllenoriz(page, context, bajtok, testInfo, { mono: false, nev: 'szines' });
    testInfo.annotations.push({ type: 'mérés', description: `logó: ${(m.tintaDoboz.x1 - m.tintaDoboz.x0).toFixed(2)} × ${(m.tintaDoboz.y1 - m.tintaDoboz.y0).toFixed(2)} pt, arány ${m.arany.toFixed(4)}` });
  });

  test('egyszínű logó a beállításból (szinesLogo: false): nincs zöld, nem torzult, a fog fehér', async ({ page, context }, testInfo) => {
    const adat = adatok();
    const { bajtok } = await pdfFeluletrol(page, adat, { t1: 2 }, { beall: { szinesLogo: false } });
    await logoEllenoriz(page, context, bajtok, testInfo, { mono: true, nev: 'mono_beallitas' });
  });

  test('egyszínű logó a CONFIG-ból (pdfSzinesLogo: false)', async ({ page, context }, testInfo) => {
    const adat = adatok();
    const { bajtok } = await pdfFeluletrol(page, adat, { t1: 2 }, { config: { pdfSzinesLogo: false } });
    await logoEllenoriz(page, context, bajtok, testInfo, { mono: true, nev: 'mono_config' });
  });

  // Az ellenőrzés kiegészítése (README, CONFIG.logo): saját logó SVG-szövegként és PNG data URL-ként. A széles logó 45 mm
  // széles lesz, a magas legfeljebb 62 pt magas (LOGO_MAX_M); az arány nem torzul, az SVG vektoros marad.
  test('saját logó a CONFIG-ból (SVG-szöveg és PNG data URL): a helyén van, nem torzul, a magas logó legfeljebb 62 pt', async ({ page, context }, testInfo) => {
    const tinta = '#1E3A4C';
    const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" fill="${tinta}"/></svg>`;
    const seged = await context.newPage();
    await seged.goto('/tests/pdfnezo.html');
    const PNG = await seged.evaluate(sz => { const c = document.createElement('canvas'); c.width = 60; c.height = 120; const x = c.getContext('2d'); x.fillStyle = sz; x.fillRect(0, 0, 60, 120); return c.toDataURL('image/png'); }, tinta);
    await seged.close();
    for (const [nev, logo, vart, kepDb] of [
      ['svg', SVG, { x1: LOGO.bal + LOGO.szel, y1: LOGO.fent + LOGO.szel * 50 / 200 }, 0],
      ['png', PNG, { x1: LOGO.bal + 62 / 2, y1: LOGO.fent + 62 }, 1]
    ]) {
      const lap = nev === 'svg' ? page : await context.newPage();          // új lap: új tároló-mag és CONFIG
      const { bajtok } = await pdfFeluletrol(lap, adatok(), { t1: 1 }, { config: { logo, logoMono: logo } });
      const kepek = pdfNyers(bajtok).kepek;                                 // PNG: a kép (és átlátszóságnál a maszkja)
      if (kepDb) expect(kepek.filter(k => k.szel === 60 && k.mag === 120).length, `${nev}: a PNG képként (60×120) került be`).toBeGreaterThanOrEqual(1);
      else expect(kepek, `${nev}: az SVG-logó vektoros (nincs képobjektum)`).toEqual([]);
      const R = await raszter(context, bajtok, { skala: 4 });
      try {
        // a vizsgált terület a logó alatt 4 pt-tal véget ér (alatta 9 pt-tal kezdődik a cím sora)
        const d = (await R.regio(LOGO.bal - 8, LOGO.fent - 8, LOGO.bal + LOGO.szel + 20, vart.y1 + 4, 0.75)).tintaDoboz;
        expect(d, `${nev}: a logó kirajzolódott`).toBeTruthy();
        for (const [k, v] of Object.entries({ x0: LOGO.bal, y0: LOGO.fent, ...vart })) expect(Math.abs(d[k] - v), `${nev}: ${k} = ${v.toFixed(2)} pt (mért: ${d[k].toFixed(2)})`).toBeLessThan(1);
        mentKep(testInfo, `sajat_logo_${nev}_x4.png`, await R.kivag(LOGO.bal - 8, LOGO.fent - 8, LOGO.bal + LOGO.szel + 20, vart.y1 + 30));
      } finally { await R.zar(); }
    }
  });

  test('egyszínű logó az Árak lap kapcsolójával (#beallMono), és a beállítás megmarad', async ({ page, context }, testInfo) => {
    const adat = adatok();
    await megnyit(page, adat, { t1: 2 }, { hash: '#arak' });
    const kapcsolo = page.locator('#beallMono');
    await expect(kapcsolo).not.toBeChecked();
    await page.locator('label.kapcsolo', { has: kapcsolo }).click();
    await expect(kapcsolo).toBeChecked();
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).szinesLogo, KULCS.beall)).toBe(false);
    await page.locator('#nezetGomb').click();
    await expect(page.locator('#letoltGomb')).toBeVisible();
    const { bajtok } = await letoltes(page);
    await logoEllenoriz(page, context, bajtok, testInfo, { mono: true, nev: 'mono_kapcsolo' });
  });
});

/* ======================================================================
   6. Elrendezés: jobbra igazított számok, hosszú nevek, végösszeg
   ====================================================================== */
const MAX_NEV = 'Cirkon korona implantátumra csavarozva, titánbázissal, egyedi felépítménnyel és esztétikai rétegzéssel – Őrlő Űr';  // 120 karakter (a szerkesztő határa)

function elrendezesEllenoriz(t, { nevOszlopJobb = null } = {}) {
  // számoszlopok: a jobb szélek (fejléc + minden szám) 0,5 pt-on belül egyeznek
  for (const k of ['menny', 'ar', 'ossz']) {
    const szelek = t.sorok.map(s => s[k + 'Elem'].jobb).concat([t.jobbSzel[k]]);
    expect(Math.max(...szelek) - Math.min(...szelek), `a(z) ${k} oszlop jobbra igazított`).toBeLessThan(0.5);
  }
  // a nevek nem érnek a számokhoz: a legbaloldalibb szám előtt legalább 4 pt hely marad
  const szamBal = Math.min(...t.szamElemek.map(e => e.x));
  for (const s of t.sorok) for (const e of s.nevElemek) {
    expect(e.jobb, `„${e.s}” nem csúszik a számokra`).toBeLessThan(szamBal - 4);
    expect(e.x).toBeGreaterThanOrEqual(TARTALOM.bal - 0.5);
    if (nevOszlopJobb != null) expect(e.jobb).toBeLessThanOrEqual(nevOszlopJobb + 0.5);
  }
  // a többsoros nevek sorai nem lógnak a következő tétel sorába
  for (let i = 0; i + 1 < t.sorok.length; i++) {
    const utolso = Math.max(...t.sorok[i].nevElemek.map(e => e.yf));
    expect(utolso, `a(z) ${i + 1}. tétel neve a saját sorában marad`).toBeLessThan(t.sorok[i + 1].yf - 0.9 * t.sorok[i + 1].meret);
  }
  // végösszeg-blokk: a felirat fölötte, az összeg jobbra igazítva az Összesen oszlophoz, nagyobb félkövér betűvel, a táblázat alatt
  expect(t.vegLabel, 'Végösszeg felirat').toBeTruthy();
  expect(t.vegosszegElem, 'végösszeg').toBeTruthy();
  expect(Math.abs(t.vegosszegElem.jobb - t.jobbSzel.ossz), 'a végösszeg az Összesen oszlophoz igazítva').toBeLessThan(0.5);
  expect(t.vegosszegElem.yf).toBeGreaterThan(t.vegLabel.yf);
  expect(t.vegosszegElem.h, 'a végösszeg betűmérete').toBeGreaterThanOrEqual(16);
  expect(t.vegosszegElem.felkover, 'a végösszeg félkövér').toBe(true);
  expect(t.vegLabel.yf - t.vegLabel.h, 'a blokk a táblázat alatt kezdődik').toBeGreaterThan(Math.max(...t.sorok.map(s => Math.max(s.yf, ...s.nevElemek.map(e => e.yf)))));
  expect(t.vegosszegElem.jobb).toBeLessThanOrEqual(TARTALOM.jobb + 0.5);
}

test.describe('elrendezés', () => {
  test('a számok jobbra igazítottak, a hosszú (120 karakteres) nevek a névoszlopban tördelődnek, a végösszeg-blokk rendben van', async ({ page, context }, testInfo) => {
    const adat = vegyesAdat(18, { hosszuMinden: 3, csoportos: false, hosszuNev: MAX_NEV.slice(0, 115) });
    adat.tetelek[0].nev = MAX_NEV;
    const menny = mindenMenny(adat, i => [1, 12, 3, 250][i % 4]);
    const vart = vartSorok(adat, menny);
    const { bajtok } = await pdfFeluletrol(page, adat, menny);
    const e = await pdfElemez(context, bajtok);
    const t = tabla(e);
    expect(t.sorok.map(s => tomor(s.nev))).toEqual(vart.sorok.map(s => tomor(s.nev)));
    expect(t.sorok.filter(s => s.nevReszek.length >= 2).length, 'a hosszú nevek több sorba törnek').toBeGreaterThanOrEqual(6);
    expect(t.vegosszeg).toBe(vart.vegosszeg);
    elrendezesEllenoriz(t);
    for (const el of elemek(e)) expect(el.jobb, `„${el.s}” a jobb margón belül`).toBeLessThanOrEqual(TARTALOM.jobb + 0.5);
    // a végösszeg-blokk zöld függőleges vonala a felirat bal oldalán
    const R = await raszter(context, bajtok, { skala: 3 });
    try {
      const v = await R.regio(t.vegLabel.x - 16, t.vegLabel.yf - t.vegLabel.h, t.vegLabel.x - 3, t.vegosszegElem.yf, 0.75);
      expect(v.zold, 'a végösszeg előtti zöld sáv').toBeGreaterThan(0.08);
      mentKep(testInfo, 'hosszu_nevek.png', (await pdfKep(context, bajtok, { skala: 2 })).png);
    } finally { await R.zar(); }
  });

  test('[PDF-01] egybeírt, szóköz nélküli hosszú tételnév nem tolja le a lapról az Összesen oszlopot és nem lóg ki a margón', async ({ page, context }, testInfo) => {
    // pl. Excelből érkező, aláhúzással tagolt név (az aláhúzásnál nincs sortörési lehetőség)
    const HOSSZU_SZO = 'Fémkerámia_korona_implantátumra_csavarozott_titánbázissal_ŐŰ';
    const adat = adatok({ orvosok: ['Dr. Kovács Éva'], tetelek: [[HOSSZU_SZO, [123456]], ['Cirkon korona', [98765]], ['Ínymaszk', [12000]]] });
    const menny = { t1: 2, t2: 1, t3: 3 };
    const vart = vartSorok(adat, menny);
    const { bajtok } = await pdfFeluletrol(page, adat, menny);
    const e = await pdfElemez(context, bajtok);
    mentKep(testInfo, 'hosszu_egybeirt_nev.png', (await pdfKep(context, bajtok, { skala: 2 })).png);
    const lista = elemek(e);
    expect(lista.find(x => x.s === 'Összesen'), 'az Összesen oszlop fejléce a lapon').toBeTruthy();
    for (const el of lista) expect(el.jobb, `„${el.s}” a jobb margón (547,28 pt) belül`).toBeLessThanOrEqual(TARTALOM.jobb + 0.5);
    const t = tabla(e);
    expect(t.sorok.map(s => [tomor(s.nev), s.menny, s.ar, s.ossz]), 'minden sorban ott a soröszeg').toEqual(vart.sorok.map(s => [tomor(s.nev), s.menny, s.ar, s.osszeg]));
    elrendezesEllenoriz(t);
  });
});

/* ======================================================================
   7. Hosszú lábjegyzet: teljes egészében a lapon, a nyomtatható részen
   ====================================================================== */
test('hosszú lábjegyzet (CONFIG.pdfLabjegyzet, ~400 karakter): teljesen kiírva, nem lóg a nyomtathatatlan szélre, nem takar', async ({ page, context }, testInfo) => {
  const LAB = 'Őszintén reméljük, hogy elégedett lesz munkánkkal; az árak bruttó árak, az áfát tartalmazzák. Űrlapon leadott megrendelésnél a szállítási díj külön tétel. ' +
    'Kérdés esetén keressen minket bizalommal a fenti elérhetőségeken, munkanapokon 8 és 16 óra között. A fogtechnikai munkák garanciális feltételei az általános ' +
    'szerződési feltételekben olvashatók, amelyeket kérésre megküldünk.';
  const adat = vegyesAdat(15);
  const { bajtok } = await pdfFeluletrol(page, adat, mindenMenny(adat), { config: { pdfLabjegyzet: LAB } });
  expect(pdfOldalSzam(bajtok)).toBe(1);
  const e = await pdfElemez(context, bajtok);
  const t = tabla(e, { csoportok: CSOPORTOK });
  const lab = elemek(e).filter(x => x.yf > t.vegosszegElem.yf + 5);
  expect(tomorSzoveg(lab), 'a teljes lábjegyzet kiírva').toContain(tomor(LAB));
  const legalso = Math.max(...lab.map(x => x.yf));
  expect(A4.h - legalso, 'az utolsó sor alapvonala legalább 14 pt-ra (≈5 mm) a lap aljától').toBeGreaterThanOrEqual(14);
  expect(Math.min(...lab.map(x => x.yf - x.h)), 'a lábjegyzet nem ér a végösszegre').toBeGreaterThan(t.vegosszegElem.yf + 6);
  const oldalszam = lab.find(x => /^1\/1/.test(x.s));
  expect(oldalszam, '1/1 oldal').toBeTruthy();
  expect(Math.abs(oldalszam.jobb - TARTALOM.jobb)).toBeLessThan(0.5);
  for (const x of lab) expect(x.jobb).toBeLessThanOrEqual(TARTALOM.jobb + 0.5);
  mentKep(testInfo, 'hosszu_labjegyzet.png', (await pdfKep(context, bajtok, { skala: 2 })).png);
});

/* ======================================================================
   8. Szürkeárnyalatos nyomtatás: a zebracsíkok és a vonalak látszanak, kevés festék
   ====================================================================== */
test('szürkeárnyalatban a zebracsíkok és a vonalak megkülönböztethetők a fehértől, a tintafedés alacsony', async ({ page, context }, testInfo) => {
  const adat = vegyesAdat(15, { csoportos: false, hosszuMinden: 0 });
  const menny = mindenMenny(adat);
  const { bajtok } = await pdfFeluletrol(page, adat, menny);
  const e = await pdfElemez(context, bajtok);
  const t = tabla(e);
  const sorok = szovegSorok(elemek(e));
  const szines = await pdfKep(context, bajtok, { skala: 2 });
  const R = await raszter(context, bajtok, { skala: 3, szurke: true });
  try {
    mentKep(testInfo, 'szurke_15_tetel.png', R.png);
    mentKep(testInfo, 'szines_15_tetel.png', szines.png);
    // zebracsík: a nevek és a számok közti üres sávban, soronként (minden második sor csíkos)
    const nevJobb = Math.max(...t.sorok.flatMap(s => s.nevElemek.map(x => x.jobb)));
    const szamBal = Math.min(...t.szamElemek.map(x => x.x));
    expect(szamBal - nevJobb, 'van üres sáv a nevek és a számok között').toBeGreaterThan(20);
    const feny = [];
    for (const s of t.sorok) feny.push((await R.regio(nevJobb + 6, s.yf - 0.62 * s.meret, szamBal - 6, s.yf - 0.12 * s.meret)).atlagL);
    const feher = feny.filter((_, i) => i % 2 === 0), csik = feny.filter((_, i) => i % 2 === 1);
    const kul = Math.min(...feher) - Math.max(...csik);
    expect(Math.min(...feher), 'a csík nélküli sorok fehérek').toBeGreaterThan(0.99);
    expect(kul, `zebracsík: fénysűrűség-különbség a fehérhez képest ${kul.toFixed(3)}`).toBeGreaterThanOrEqual(0.03);
    expect(Math.max(...csik), 'a csík világos (kevés festék)').toBeGreaterThan(0.9);

    // vonalak: a fejléc alatti elválasztó, a táblázatfejléc aláhúzása, a lábléc vonala
    const sorszamSor = sorok.find(s => s.szoveg.startsWith('Sorszám'));
    const kontaktSor = sorok.filter(s => s.yf < sorok.find(x => x.szoveg.startsWith('Címzett')).yf).pop();
    const cimzett = sorok.find(s => s.szoveg.startsWith('Címzett'));
    const fej = t.fej['Megnevezés'];
    const lab = sorok.find(s => s.szoveg.startsWith('Az árlista'));
    const vonal = async (y0, y1) => { const r = await R.sorok(70, y0, 520, y1); return 1 - Math.min(...r.map(x => x.L)); };
    const elvalaszto = await vonal(Math.max(sorszamSor.yf, kontaktSor.yf) + 3, cimzett.yf - cimzett.meret);
    const fejVonal = await vonal(fej.yf + 1, t.sorok[0].yf - t.sorok[0].meret);
    const labVonal = await vonal(t.vegosszegElem.yf + 6, lab.yf - lab.meret);
    expect(elvalaszto, `a fejléc alatti elválasztó vonal (kontraszt ${elvalaszto.toFixed(3)})`).toBeGreaterThan(0.06);
    expect(fejVonal, `a táblázatfejléc aláhúzása (kontraszt ${fejVonal.toFixed(3)})`).toBeGreaterThan(0.25);
    expect(labVonal, `a lábléc vonala (kontraszt ${labVonal.toFixed(3)})`).toBeGreaterThan(0.06);

    // tintafedés: az oldal átlagos „sötétsége” szürkében
    expect(R.atlagTinta, `tintafedés szürkében: ${(R.atlagTinta * 100).toFixed(2)}%`).toBeLessThan(0.06);
    const meres = { zebraKulonbseg: +kul.toFixed(4), csikL: +Math.max(...csik).toFixed(4), elvalaszto: +elvalaszto.toFixed(3), fejVonal: +fejVonal.toFixed(3), labVonal: +labVonal.toFixed(3),
      tintaSzurke: +(R.atlagTinta * 100).toFixed(2), tintaSzines: +(szines.atlagTinta * 100).toFixed(2) };
    mentFajl(testInfo, 'szurke_meres.json', JSON.stringify(meres, null, 2));
    testInfo.annotations.push({ type: 'mérés', description: JSON.stringify(meres) });
    console.log(`[mérés] ${testInfo.project.name} szürkeárnyalat: ${JSON.stringify(meres)}`);
  } finally { await R.zar(); }
});
