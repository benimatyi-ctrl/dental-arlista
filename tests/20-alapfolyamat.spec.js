// 2. Funkcionális tesztek — az alap folyamat orvosonként (Peti, Dani, Anna): a kiválasztott orvos árai,
// a sorösszegek, a végösszeg és a PDF, összevetve a vba.xlsm „Adatbázis” lapjának adataival.
import fs from 'node:fs';
import { test, expect, nyit, orvosValaszt, mennyBeir, osszegSzoveg, letoltes, ftSzam, kimenetUt } from './segito.js';
import { ADATBAZIS, VBA_XLSM, adatbazisLap, ny, ftVart, sorOsszeg, sorAr, pdfSorok, pdfTetelSor, pdfVegosszeg, pdfSorszam, arakMegnyit, arCella } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const TETELEK = Object.keys(ADATBAZIS.arak);
const MENNY = { tetel1: 1, tetel2: 2, tetel3: 3, tetel4: 4 };
const ar = (tetel, orvos) => ADATBAZIS.arak[tetel][ADATBAZIS.orvosok.indexOf(orvos)];

test.describe('alap folyamat a beépített (Adatbázis) adatokkal', () => {
  test('orvos nélkül nincs egységár, és a tipp kéri az orvosválasztást', async ({ page }) => {
    await nyit(page, { ido: IDO });                    // tároló nélkül: a beépített mintaadatok
    await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(ADATBAZIS.orvosok);
    await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveCount(0);
    await expect(page.locator('#orvosTipp')).toBeVisible();
    await expect(page.locator('#orvosTipp')).toContainText('Válassz orvost');
    for (const t of TETELEK) await expect(sorAr(page, t)).toBeHidden();
    await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
  });

  for (const orvos of ADATBAZIS.orvosok) {
    test(`${orvos}: az egységárak az Adatbázis lap ${orvos} oszlopából jönnek`, async ({ page }) => {
      await nyit(page, { ido: IDO });
      await orvosValaszt(page, orvos);
      await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText(orvos);
      await expect(page.locator('#orvosTipp')).toBeHidden();
      for (const t of TETELEK) {
        await expect(sorAr(page, t)).toBeVisible();
        await expect.poll(async () => ny(await sorAr(page, t).innerText()), `${t} egységára`).toBe(ftVart(ar(t, orvos)) + ' / db');
      }
    });

    test(`${orvos}: sorösszeg, végösszeg és PDF (1, 2, 3, 4 db) egyezik az Adatbázis szerint számolttal`, async ({ page, context }, testInfo) => {
      await nyit(page, { ido: IDO });
      await orvosValaszt(page, orvos);
      let vart = 0;
      for (const t of TETELEK) {
        await mennyBeir(page, t, MENNY[t]);
        const sor = MENNY[t] * ar(t, orvos);
        vart += sor;
        await expect(sorOsszeg(page, t)).toBeVisible();
        expect(ny(await sorOsszeg(page, t).innerText()), `${t} sorösszege`).toBe(`${MENNY[t]} db = ${ftVart(sor)}`);
      }
      await expect.poll(async () => ny(await osszegSzoveg(page))).toBe(`4 tétel, ${ftVart(vart)}`);

      const { nev, bajtok } = await letoltes(page);
      expect(nev).toBe(`Arlista_${orvos}_2026-10-10.pdf`);
      fs.writeFileSync(kimenetUt('funkcionalis', `alap_${orvos}_${testInfo.project.name}.pdf`), bajtok);
      const p = await pdfSorok(context, bajtok);
      expect(p.e.oldalak).toBe(1);
      expect(Math.round(p.e.oldal[0].w)).toBe(595);
      expect(Math.round(p.e.oldal[0].h)).toBe(842);
      expect(p.szoveg).toContain(`Címzett: Dr. ${orvos}`);
      expect(p.szoveg).toContain('2026.10.10.');
      expect(pdfSorszam(p)).toBe('20261010-01');
      expect(p.szoveg).toContain('2026.11.09-ig érvényes');
      for (const t of TETELEK) {
        const s = pdfTetelSor(p, t);
        expect(s, `a PDF-ben nincs „${t}” sor:\n${p.szoveg}`).not.toBeNull();
        expect(s.cellak, t).toEqual([t, `${MENNY[t]} db`, ftVart(ar(t, orvos)), ftVart(MENNY[t] * ar(t, orvos))]);
      }
      // a PDF sorainak összege = a Végösszeg = a sávban látott összeg
      const sorokOssz = TETELEK.reduce((a, t) => a + pdfTetelSor(p, t).osszeg, 0);
      expect(sorokOssz).toBe(vart);
      expect(pdfVegosszeg(p)).toEqual({ szoveg: ftVart(vart), szam: vart });
      // a kész panel a sorszámot és a fájlnevet mutatja
      await expect(page.locator('#keszCim')).toContainText('sorszám: 20261010-01');
      await expect(page.locator('#keszFajl')).toHaveText(`Arlista_${orvos}_2026-10-10.pdf`);
    });
  }

  test('orvosváltáskor a mennyiségek megmaradnak, az egységár, a sorösszeg és a végösszeg az új orvosé', async ({ page }) => {
    await nyit(page, { ido: IDO });
    await orvosValaszt(page, 'Peti');
    await mennyBeir(page, 'tetel1', 2);
    await mennyBeir(page, 'tetel3', 5);
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe(`2 tétel, ${ftVart(2 * 10000 + 5 * 9000)}`);
    for (const orvos of ['Dani', 'Anna', 'Peti']) {
      await orvosValaszt(page, orvos);
      const vart = 2 * ar('tetel1', orvos) + 5 * ar('tetel3', orvos);
      await expect.poll(async () => ny(await osszegSzoveg(page))).toBe(`2 tétel, ${ftVart(vart)}`);
      expect(ny(await sorOsszeg(page, 'tetel1').innerText())).toBe(`2 db = ${ftVart(2 * ar('tetel1', orvos))}`);
      expect(ny(await sorOsszeg(page, 'tetel3').innerText())).toBe(`5 db = ${ftVart(5 * ar('tetel3', orvos))}`);
      expect(ny(await sorAr(page, 'tetel2').innerText())).toBe(`${ftVart(ar('tetel2', orvos))} / db`);
      await expect(sorOsszeg(page, 'tetel2')).toBeHidden();
    }
  });
});

test.describe('összevetés a vba.xlsm „Adatbázis” lapjával', () => {
  test.skip(!fs.existsSync(VBA_XLSM), 'A tests/fixtures/privat/vba.xlsm nincs meg (nem nyilvános fájl, a tárolóban nincs benne); másold ide a _fejlesztes/teszt-fajlok/vba.xlsm-et.');

  test('a vba.xlsm Adatbázis lapja = a tesztek ADATBAZIS táblája = az alkalmazás beépített árai (Árak nézet)', async ({ page }) => {
    const lap = adatbazisLap(VBA_XLSM);
    expect(lap[0].slice(1)).toEqual(ADATBAZIS.orvosok);
    const lapArak = Object.fromEntries(lap.slice(1).filter(r => r[0]).map(r => [r[0], r.slice(1, 1 + ADATBAZIS.orvosok.length)]));
    expect(lapArak).toEqual(ADATBAZIS.arak);
    await nyit(page, { ido: IDO });
    await arakMegnyit(page);
    await expect(page.locator('#arTabla thead .fej-gomb')).toHaveText(ADATBAZIS.orvosok);
    await expect(page.locator('#arTabla tbody .sor-gomb')).toHaveText(Object.keys(lapArak));
    for (const [t, sor] of Object.entries(lapArak)) {
      for (const [j, orvos] of ADATBAZIS.orvosok.entries()) {
        expect(ftSzam(await arCella(page, t, orvos).inputValue()), `${t} · ${orvos}`).toBe(sor[j]);
      }
    }
  });
});
