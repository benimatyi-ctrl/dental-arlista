// Füstpróba: a tesztkeret és az alap folyamat (orvos → mennyiség → PDF letöltése) minden nézetben.
import { test, expect, nyit, adatok, orvosValaszt, mennyBeir, osszegSzoveg, letoltes, pdfElemez, pdfBetuk, ftSzam } from './segito.js';

test('alap folyamat: Peti, tetel1 × 2 → egyoldalas A4 PDF', async ({ page, context }) => {
  await nyit(page, { adat: adatok(), ido: '2026-10-10T09:00:00' });
  await orvosValaszt(page, 'Peti');
  await mennyBeir(page, 'tetel1', 2);
  await expect(page.locator('#osszeg')).toContainText('1');
  expect(ftSzam((await osszegSzoveg(page)).split(',')[1])).toBe(20000);
  const { nev, bajtok } = await letoltes(page);
  expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
  const e = await pdfElemez(context, bajtok);
  expect(e.oldalak).toBe(1);
  expect(Math.round(e.oldal[0].w)).toBe(595);
  expect(Math.round(e.oldal[0].h)).toBe(842);
  const szoveg = e.oldal[0].elemek.map(x => x.s).join(' ');
  expect(szoveg).toContain('tetel1');
  for (const b of pdfBetuk(bajtok)) expect(b.beagyazott, b.nev).toBe(true);
});
