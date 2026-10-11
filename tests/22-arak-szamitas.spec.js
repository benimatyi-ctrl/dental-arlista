// 2. Funkcionális tesztek — árak és számítás: 0 Ft-os ár, hiányzó ár egy orvosnál, nagyon nagy ár, tört árak
// (0,1 + 0,2 = 0,3 pontosan, lebegőpontos hiba sehol), az ár beírása az Árak táblázatba (arErtelmez).
import fs from 'node:fs';
import { test, expect, nyit, adatok, valasztas, orvosValaszt, mennyBeir, mennyMezo, tetelSor, osszegSzoveg, letoltes, kimenetUt, uzenetNaploIndit, uzenetNaplo } from './segito.js';
import { ny, ftVart, sorOsszeg, sorAr, pdfSorok, pdfTetelSor, pdfVegosszeg, arakMegnyit, listaraVissza, arCella, taroltAdat, dlgGomb, dlgNyitva } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const LEBEGO = /\d[,.]\d*0000|\d[,.]\d*9999|e[+-]?\d/i;   // 0,30000000000000004 / 0,2999999 / 1e+21 típusú szöveg

async function megnyitAdattal(page, tetelek, { orvosok = ['Peti', 'Dani'], orvos = 'Peti', menny = {} } = {}) {
  const a = adatok({ orvosok, tetelek });
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos, menny }), ido: IDO });
  return a;
}

test('0 Ft-os ár: „0 Ft / db”, a sorösszeg 0 Ft, a PDF elkészül, és a 0 Ft-os sor is benne van', async ({ page, context }) => {
  await megnyitAdattal(page, [['Próba-munka', [0, 500]], ['Korona', [10000, 12000]]]);
  await expect.poll(async () => ny(await sorAr(page, 'Próba-munka').innerText())).toBe('0 Ft / db');
  await mennyBeir(page, 'Próba-munka', 3);
  await mennyBeir(page, 'Korona', 1);
  expect(ny(await sorOsszeg(page, 'Próba-munka').innerText())).toBe('3 db = 0 Ft');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 10 000 Ft');
  const { bajtok } = await letoltes(page);
  const p = await pdfSorok(context, bajtok);
  expect(pdfTetelSor(p, 'Próba-munka').cellak).toEqual(['Próba-munka', '3 db', '0 Ft', '0 Ft']);
  expect(pdfVegosszeg(p).szam).toBe(10000);
});

test('csak 0 Ft-os tétellel is elkészül a PDF (Végösszeg: 0 Ft)', async ({ page, context }) => {
  await megnyitAdattal(page, [['Próba-munka', [0, 500]]], { menny: { 'Próba-munka': 2 } });
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 0 Ft');
  const { bajtok } = await letoltes(page);
  const p = await pdfSorok(context, bajtok);
  expect(pdfVegosszeg(p)).toEqual({ szoveg: '0 Ft', szam: 0 });
});

test('hiányzó ár egy orvosnál: „Nincs ára”, a + és a mező tiltva; mennyiséggel a sáv szól, a PDF nem készül el, a párbeszéd megmondja a teendőt', async ({ page }) => {
  await megnyitAdattal(page, [['Csak Petinél', [7000, null]], ['Korona', [10000, 12000]]], { orvos: 'Dani' });
  const sor = tetelSor(page, 'Csak Petinél');
  await expect(sorAr(page, 'Csak Petinél')).toHaveText('Nincs ára ennél az orvosnál');
  await expect(sor.locator('.lep-plusz')).toBeDisabled();
  await expect(mennyMezo(page, 'Csak Petinél')).toBeDisabled();
  // Petinél beállítva, majd Danira váltva
  await orvosValaszt(page, 'Peti');
  await mennyBeir(page, 'Csak Petinél', 2);
  await mennyBeir(page, 'Korona', 1);
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 24 000 Ft');
  await orvosValaszt(page, 'Dani');
  await expect(sorAr(page, 'Csak Petinél')).toHaveText(/Nincs ára ennél az orvosnál: állítsd 0-ra, vagy adj meg árat/);
  await expect(sor).toHaveClass(/arhiany/);
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 12 000 Ft · 1 ár nélkül');
  await expect(page.locator('#savUzenet')).toBeVisible();
  expect(ny(await page.locator('#savUzenet').innerText())).toBe('Nincs megadott ár (Dr. Dani): Csak Petinél. Adj meg árat az Árak lapon, vagy állítsd a mennyiséget 0-ra.');
  // letöltés: nincs fájl, párbeszédablak a teendővel
  let letoltott = false;
  page.on('download', () => { letoltott = true; });
  await page.locator('#letoltGomb').click();
  const d = await dlgNyitva(page);
  await expect(d.locator('#dlgCim')).toHaveText('Hiányzó ár');
  await expect(d).toContainText('Ezeknek a tételeknek nincs ára (Dr. Dani): Csak Petinél.');
  await expect(d).toContainText('Adj meg árat az Árak lapon, vagy állítsd ezeknél a tételeknél a mennyiséget 0-ra.');
  await dlgGomb(page, 'Árak megnyitása').click();
  await expect(page.locator('#nezetArak')).toBeVisible();
  await listaraVissza(page);
  // 0-ra állítva (a − gomb működik ár nélkül is) elkészül
  await sor.locator('.lep-minusz').click();
  await sor.locator('.lep-minusz').click();
  await expect(mennyMezo(page, 'Csak Petinél')).toHaveValue('0');
  await expect(page.locator('#savUzenet')).toBeHidden();
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 12 000 Ft');
  expect(letoltott).toBe(false);
  const { nev } = await letoltes(page);
  expect(nev).toBe('Arlista_Dani_2026-10-10.pdf');
});

test('nagyon nagy ár: 99 999 999 Ft × 9999 db — pontos számjegyek a sorban, a sávban és a PDF-ben, kitevő és tizedes nélkül', async ({ page, context }, testInfo) => {
  await megnyitAdattal(page, [['Drága A', [99999999, 1]], ['Drága B', [99999999, 1]], ['Olcsó', [1, 1]]],
    { menny: { 'Drága A': 9999, 'Drága B': 9999, 'Olcsó': 1 } });
  const sor = 99999999 * 9999;                     // 999 899 990 001
  const vart = 2 * sor + 1;                         // 1 999 799 980 003
  await expect.poll(async () => ny(await sorOsszeg(page, 'Drága A').innerText())).toBe('9 999 db = 999 899 990 001 Ft');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('3 tétel, 1 999 799 980 003 Ft');
  expect(ny(await sorAr(page, 'Drága A').innerText())).toBe('99 999 999 Ft / db');
  const { bajtok } = await letoltes(page);
  fs.writeFileSync(kimenetUt('funkcionalis', `nagy_ar_${testInfo.project.name}.pdf`), bajtok);
  const p = await pdfSorok(context, bajtok);
  expect(p.e.oldalak).toBe(1);
  expect(pdfTetelSor(p, 'Drága A').cellak).toEqual(['Drága A', '9 999 db', '99 999 999 Ft', '999 899 990 001 Ft']);
  expect(pdfVegosszeg(p)).toEqual({ szoveg: ftVart(vart), szam: vart });
  expect(p.szoveg).not.toMatch(LEBEGO);
});

test('tört árak: 0,1 + 0,2 = 0,3 pontosan (sor, sáv, PDF), és a többi lebegőpontos eset sem látszik', async ({ page, context }) => {
  await megnyitAdattal(page, [['Tíz fillér', [0.1, 1]], ['Húsz fillér', [0.2, 1]], ['Hét fillér', [0.07, 1]], ['Harminchárom', [33.33, 1]], ['Egy-egy', [1.1, 1]]],
    { menny: { 'Tíz fillér': 1, 'Húsz fillér': 1 } });
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 0,3 Ft');
  expect(ny(await sorOsszeg(page, 'Tíz fillér').innerText())).toBe('1 db = 0,1 Ft');
  expect(ny(await sorAr(page, 'Húsz fillér').innerText())).toBe('0,2 Ft / db');
  let { bajtok } = await letoltes(page);
  let p = await pdfSorok(context, bajtok);
  expect(pdfVegosszeg(p)).toEqual({ szoveg: '0,3 Ft', szam: 0.3 });
  expect(p.szoveg).not.toMatch(LEBEGO);
  // 0,07 × 3 = 0,21 (nem 0,21000000000000002); 33,33 × 3 = 99,99; 1,1 × 3 = 3,3; összesen 103,5
  await page.locator('#keszUjGomb').click();
  await mennyBeir(page, 'Hét fillér', 3);
  await mennyBeir(page, 'Harminchárom', 3);
  await mennyBeir(page, 'Egy-egy', 3);
  expect(ny(await sorOsszeg(page, 'Hét fillér').innerText())).toBe('3 db = 0,21 Ft');
  expect(ny(await sorOsszeg(page, 'Harminchárom').innerText())).toBe('3 db = 99,99 Ft');
  expect(ny(await sorOsszeg(page, 'Egy-egy').innerText())).toBe('3 db = 3,3 Ft');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('3 tétel, 103,5 Ft');
  ({ bajtok } = await letoltes(page));
  p = await pdfSorok(context, bajtok);
  expect(pdfTetelSor(p, 'Hét fillér').cellak).toEqual(['Hét fillér', '3 db', '0,07 Ft', '0,21 Ft']);
  expect(pdfVegosszeg(p)).toEqual({ szoveg: '103,5 Ft', szam: 103.5 });
  expect(p.szoveg).not.toMatch(LEBEGO);
});

test('tíz darab 0,1 Ft-os tétel összege pontosan 1 Ft (nem 0,99 vagy 1,0000000000000002)', async ({ page }) => {
  const t = Array.from({ length: 10 }, (_, i) => [`Fillér ${i + 1}`, [0.1]]);
  const menny = Object.fromEntries(t.map(([n]) => [n, 1]));
  await megnyitAdattal(page, t, { orvosok: ['Peti'], menny });
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('10 tétel, 1 Ft');
});

/* ------------------------------------------------------------ ár beírása az Árak táblázatba */
const AR_JO = [
  ['10 000', 10000, '10 000'], ['10.000', 10000, '10 000'], ['10,5', 10.5, '10,5'], ['12 500 Ft', 12500, '12 500'],
  ['1.234.567', 1234567, '1 234 567'], ['0', 0, '0'], ['0,1', 0.1, '0,1'], ['99 999 999', 99999999, '99 999 999'],
  ['10 000', 10000, '10 000'], [' 7,25 ', 7.25, '7,25']
];
for (const [be, vart, kijelzo] of AR_JO) {
  test(`ár beírása: „${be.replace(/ /g, '[nem törő szóköz]')}” → ${vart} Ft, a cellában „${kijelzo}”, a listában is`, async ({ page }) => {
    await megnyitAdattal(page, [['tetel1', [5000, 6000]]]);
    await arakMegnyit(page);
    const c = arCella(page, 'tetel1', 'Peti');
    await c.click();
    await c.fill(be);
    await c.press('Enter');                         // utolsó mező: elhagyja
    await expect.poll(async () => (await taroltAdat(page)).arak.t1.o1).toBe(vart);
    expect(ny(await c.inputValue())).toBe(kijelzo);
    await expect(page.locator('#uzenetek .uzenet.hiba')).toHaveCount(0);
    await listaraVissza(page);
    expect(ny(await sorAr(page, 'tetel1').innerText())).toBe(`${kijelzo} Ft / db`);
  });
}

test('ár törlése (üres mező): az orvosnak nincs ára arra a tételre', async ({ page }) => {
  await megnyitAdattal(page, [['tetel1', [5000, 6000]]]);
  await arakMegnyit(page);
  const c = arCella(page, 'tetel1', 'Peti');
  await c.click();
  await c.fill('');
  await c.press('Enter');
  await expect.poll(async () => (await taroltAdat(page)).arak.t1).toEqual({ o2: 6000 });
  await expect(c).toHaveValue('');
  await expect(c).toHaveAttribute('placeholder', '—');
  await listaraVissza(page);
  await expect(sorAr(page, 'tetel1')).toHaveText('Nincs ára ennél az orvosnál');
});

const AR_ROSSZ = [
  ['abc', /csak szám lehet/], ['-5', /csak szám lehet/], ['1e9', /csak szám lehet/], ['12 500 Ft/db', /csak szám lehet/],
  ['100000000', /legfeljebb 99\s999\s999\sFt/]
];
for (const [be, uzenet] of AR_ROSSZ) {
  test(`hibás ár: „${be}” → az ár nem változik (5 000 Ft), és üzenet mondja meg, mit írjon be`, async ({ page }) => {
    await uzenetNaploIndit(page);
    await megnyitAdattal(page, [['tetel1', [5000, 6000]]]);
    await arakMegnyit(page);
    const elotte = JSON.stringify(await taroltAdat(page));
    const c = arCella(page, 'tetel1', 'Peti');
    await c.click();
    await c.fill(be);
    await c.press('Enter');
    // az értesítés 4,5 mp-ig látszik: a napló terhelt gépen sem marad le róla
    await expect.poll(() => uzenetNaplo(page).then(n => n.filter(x => x.startsWith('hiba: ')).join('\n'))).toMatch(new RegExp(uzenet.source + String.raw`.*Az ár nem változott\.`));
    await expect(c).toHaveValue(/^5\s000$/);
    expect(JSON.stringify(await taroltAdat(page))).toBe(elotte);
  });
}

test('[FUN-04] ár „0,500” alakban: a 0 nem lehet ezres csoport, ezért 0,5 Ft (nem 500 Ft)', async ({ page }) => {
  const r = await (async () => {
    await megnyitAdattal(page, [['tetel1', [5000, 6000]]]);
    return page.evaluate(() => [window.dentAl.arErtelmez('0,500'), window.dentAl.arErtelmez('0.250'), window.dentAl.arErtelmez('1,500')]);
  })();
  expect(r[2], 'az „1,500” ezres tagolás marad (1500 Ft)').toEqual({ ertek: 1500 });
  expect(r[0]).toEqual({ ertek: 0.5 });
  expect(r[1]).toEqual({ ertek: 0.25 });
  await arakMegnyit(page);
  const c = arCella(page, 'tetel1', 'Peti');
  await c.click();
  await c.fill('0,500');
  await c.press('Enter');
  await expect.poll(async () => (await taroltAdat(page)).arak.t1.o1).toBe(0.5);
});

// Az Árak cellája gépelés közben (0,5 mp szünet után) csendben menti az addig beírt, érvényes részt. Ha a végső szöveg
// hibás, a mező elhagyásakor az üzenet azt mondja: „Az ár nem változott.” — ennek igaznak kell lennie: az ár a mezőbe
// lépés előtti (5 000 Ft) marad, nem a gépelés közbeni részérték (1 Ft, 10 000 000 Ft).
for (const [elso, tobbi, uzenet] of [['1', 'e9', /csak szám lehet/], ['10000000', '0', /legfeljebb 99\s999\s999\sFt/]]) {
  test(`[FUN-E1] lassan gépelt, végül hibás ár („${elso}${tobbi}”): „Az ár nem változott” — és tényleg 5 000 Ft marad, nem a részérték`, async ({ page }) => {
    await megnyitAdattal(page, [['tetel1', [5000, 6000]]], { menny: { tetel1: 2 } });
    await arakMegnyit(page);
    const c = arCella(page, 'tetel1', 'Peti');
    await c.click();
    await c.press('ControlOrMeta+a');
    await c.pressSequentially(elso);
    // a gépelés közbeni mentés megvárása (a felhasználó gondolkodik); ha az alkalmazás nem ment közben, 4 mp után megyünk tovább
    await page.waitForFunction(v => JSON.parse(localStorage.getItem('dentAl.adatok.v1')).arak.t1.o1 === v, Number(elso), { timeout: 4000 }).catch(() => {});
    await c.pressSequentially(tobbi);
    await c.evaluate(e => e.blur());
    await expect(page.locator('#uzenetek .uzenet.hiba').first()).toContainText(new RegExp(uzenet.source + String.raw`.*Az ár nem változott\.`));
    expect((await taroltAdat(page)).arak.t1.o1, 'az üzenet szerint az ár nem változott').toBe(5000);
    await expect(c).toHaveValue(/^5\s000$/);
    await listaraVissza(page);
    expect(ny(await sorOsszeg(page, 'tetel1').innerText())).toBe('2 db = 10 000 Ft');
  });
}

// A magyar írásmód: pont az ezres tagolás és vessző a tizedes („10.000,50”), illetve a „,-” a kerek összeg végén
// („12.500,- Ft”). Külön-külön mindkét jelet elfogadja az alkalmazás („10.000”, „10,5”), együtt viszont nem.
test('[FUN-E2] magyar írásmódú ár: „10.000,50” → 10 000,5 Ft és „12.500,- Ft” → 12 500 Ft (nem „csak szám lehet”)', async ({ page }) => {
  await megnyitAdattal(page, [['tetel1', [5000, 6000]]]);
  const r = await page.evaluate(() => ['10.000,50', '1.234.567,8', '12.500,- Ft', '12 500,-'].map(s => window.dentAl.arErtelmez(s)));
  expect(r).toEqual([{ ertek: 10000.5 }, { ertek: 1234567.8 }, { ertek: 12500 }, { ertek: 12500 }]);
  await arakMegnyit(page);
  const c = arCella(page, 'tetel1', 'Peti');
  await c.click();
  await c.fill('10.000,50');
  await c.press('Enter');
  await expect.poll(async () => (await taroltAdat(page)).arak.t1.o1).toBe(10000.5);
  await expect(page.locator('#uzenetek .uzenet.hiba')).toHaveCount(0);
});

test('az ár a listában azonnal frissül: a sorösszeg és a végösszeg az új árral számol', async ({ page }) => {
  await megnyitAdattal(page, [['tetel1', [5000, 6000]], ['tetel2', [100, 200]]], { menny: { tetel1: 3, tetel2: 1 } });
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 15 100 Ft');
  await arakMegnyit(page);
  const c = arCella(page, 'tetel1', 'Peti');
  await c.click();
  await c.fill('4 999,99');
  await c.press('Tab');
  await expect.poll(async () => (await taroltAdat(page)).arak.t1.o1).toBe(4999.99);
  await listaraVissza(page);
  expect(ny(await sorOsszeg(page, 'tetel1').innerText())).toBe('3 db = 14 999,97 Ft');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 15 099,97 Ft');
});
