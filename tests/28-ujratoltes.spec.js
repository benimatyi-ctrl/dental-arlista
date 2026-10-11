// 2. Funkcionális tesztek — újratöltés után megmaradnak-e az adatok és a beállítások: a kiválasztott orvos,
// a mennyiségek, a dátum, a nullázás és a logó beállítása, az új orvos és tétel az áraival, a napi sorszám.
import { test, expect, nyit, adatok, valasztas, orvosValaszt, mennyBeir, mennyMezo, osszegSzoveg, letoltes } from './segito.js';
import { ujratolt, ny, taroltAdat, taroltMennyNevvel, nevesAlak, arakMegnyit, listaraVissza, arCella, ujElemFelvesz, dlgZarva, dlgNyitva, orvosFejGomb, tetelSorGomb, sorAr, pdfSorok, pdfSorszam } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';

test('minden megmarad: orvos, mennyiségek, dátum, beállítások, új orvos e-maillel, új tétel csoporttal és árral, módosított ár', async ({ page }) => {
  await nyit(page, { ido: IDO });                      // a beépített mintaadatokkal indul, minden a felületen át
  await orvosValaszt(page, 'Dani');
  await mennyBeir(page, 'tetel2', 3);
  await mennyBeir(page, 'tetel4', 1);
  await page.locator('#datumMezo').fill('2026-10-08');
  await page.locator('#datumMezo').blur();
  await expect(page.locator('#datumTipp')).toBeVisible();
  await arakMegnyit(page);
  await page.locator('#beallNullazas').uncheck();
  await page.locator('#beallMono').check();
  await ujElemFelvesz(page, 'orvos', 'Dr. Szűcs Ádám', { email: 'szucs@rendelo.hu' });
  await dlgZarva(page);
  await ujElemFelvesz(page, 'tetel', 'Cirkon korona', { csoport: 'Protetika' });
  await dlgZarva(page);
  for (const [t, o, v] of [['Cirkon korona', 'Dani', '25 000'], ['tetel1', 'Peti', '10 500,5']]) {
    const c = arCella(page, t, o);
    await c.click(); await c.fill(v); await c.press('Tab');
  }
  await expect.poll(async () => nevesAlak(await taroltAdat(page)).tetelek[0].arak.Peti).toBe(10500.5);
  await listaraVissza(page);
  await mennyBeir(page, 'Cirkon korona', 2);
  const elotteOsszeg = ny(await osszegSzoveg(page));
  expect(elotteOsszeg).toBe('3 tétel, 91 300 Ft');
  const elotteAdat = nevesAlak(await taroltAdat(page));

  await ujratolt(page);

  await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Dani');
  await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(['Peti', 'Dani', 'Anna', 'Dr. Szűcs Ádám']);
  await expect(mennyMezo(page, 'tetel2')).toHaveValue('3');
  await expect(mennyMezo(page, 'tetel4')).toHaveValue('1');
  await expect(mennyMezo(page, 'Cirkon korona')).toHaveValue('2');
  await expect(page.locator('#datumMezo')).toHaveValue('2026-10-08');
  await expect(page.locator('#datumTipp')).toBeVisible();
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe(elotteOsszeg);
  await expect(page.locator('#tetelLista .csoport-cim')).toHaveText(['Egyéb', 'Protetika']);
  expect(nevesAlak(await taroltAdat(page))).toEqual(elotteAdat);
  await arakMegnyit(page);
  await expect(page.locator('#beallNullazas')).not.toBeChecked();
  await expect(page.locator('#beallMono')).toBeChecked();
  expect(ny(await arCella(page, 'tetel1', 'Peti').inputValue())).toBe('10 500,5');
  expect(ny(await arCella(page, 'Cirkon korona', 'Dani').inputValue())).toBe('25 000');
  await orvosFejGomb(page, 'Dr. Szűcs Ádám').click();
  await dlgNyitva(page);
  await expect(page.locator('#emailMezo')).toHaveValue('szucs@rendelo.hu');
  await page.keyboard.press('Escape');
  await dlgZarva(page);
  // a nullázás kikapcsolása az újratöltés után is érvényes
  await listaraVissza(page);
  await letoltes(page);
  await expect(page.locator('#keszUjGomb')).toHaveText('Bezárás');
  await expect(mennyMezo(page, 'tetel2')).toHaveValue('3');
});

test('a napi sorszám újratöltés után folytatódik (02), a nullázott mennyiségek nullák maradnak', async ({ page, context }) => {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Anna', menny: { tetel1: 1 } }), ido: IDO });
  let r = await letoltes(page);
  expect(pdfSorszam(await pdfSorok(context, r.bajtok))).toBe('20261010-01');
  await ujratolt(page);
  await expect(page.locator('#savKesz')).toBeHidden();
  await expect(mennyMezo(page, 'tetel1')).toHaveValue('0');
  expect(await taroltMennyNevvel(page)).toEqual({});
  await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Anna');
  await mennyBeir(page, 'tetel3', 2);
  r = await letoltes(page);
  expect(pdfSorszam(await pdfSorok(context, r.bajtok))).toBe('20261010-02');
});

test('Enter nélkül, gépelés közben beírt mennyiség is megmarad', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti' }), ido: IDO });
  await mennyMezo(page, 'tetel3').fill('7');
  await expect.poll(async () => (await taroltMennyNevvel(page)).tetel3).toBe(7);
  await ujratolt(page);
  await expect(mennyMezo(page, 'tetel3')).toHaveValue('7');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 63 000 Ft');
});

test('a gépelt, de el nem hagyott ár is megmarad, ha a lap bezárul / újratöltődik', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti' }), ido: IDO });
  await arakMegnyit(page);
  const c = arCella(page, 'tetel2', 'Peti');
  await c.click();
  await c.fill('12 345');
  await expect(c).toBeFocused();
  await ujratolt(page);
  await expect.poll(async () => nevesAlak(await taroltAdat(page)).tetelek[1].arak.Peti).toBe(12345);
  await arakMegnyit(page);
  expect(ny(await arCella(page, 'tetel2', 'Peti').inputValue())).toBe('12 345');
});

test('„ma” választott dátum másnap újratöltve az új napot mutatja; a kifejezetten választott nap megmarad', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 1 } }), ido: IDO });
  await expect(page.locator('#datumMezo')).toHaveValue('2026-10-10');
  await page.clock.setFixedTime(new Date('2026-10-11T08:00:00'));
  await ujratolt(page);
  await expect(page.locator('#datumMezo')).toHaveValue('2026-10-11');
  await expect(page.locator('#datumTipp')).toBeHidden();
  await page.locator('#datumMezo').fill('2026-10-09');
  await page.locator('#datumMezo').blur();
  await expect(page.locator('#datumTipp')).toBeVisible();
  await ujratolt(page);
  await expect(page.locator('#datumMezo')).toHaveValue('2026-10-09');
  await expect(page.locator('#datumTipp')).toBeVisible();
  const { nev } = await letoltes(page);
  expect(nev).toBe('Arlista_Peti_2026-10-09.pdf');
});

test('törölt tétel és átnevezett orvos újratöltés után is úgy marad', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 1, tetel2: 2 } }), ido: IDO });
  await arakMegnyit(page);
  await orvosFejGomb(page, 'Peti').click();
  await dlgNyitva(page);
  await page.locator('#nevMezo').fill('Péter');
  await page.locator('#nevMezo').press('Enter');
  await dlgZarva(page);
  // a tetel1 törlése (a beírt 1 db-jával együtt)
  await tetelSorGomb(page, 'tetel1').click();
  await dlgNyitva(page);
  await page.locator('#dlg .gomb-link.veszely', { hasText: 'Tétel törlése' }).click();
  await dlgNyitva(page);
  await page.locator('#dlg .dlg-lab button', { hasText: 'Törlés' }).click();
  await dlgZarva(page);
  await ujratolt(page);
  await listaraVissza(page);
  await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Péter');
  await expect(page.locator('#tetelLista li.tetel .tetel-nev')).toHaveText(['tetel2', 'tetel3', 'tetel4']);
  await expect(mennyMezo(page, 'tetel2')).toHaveValue('2');
  expect(await taroltMennyNevvel(page)).toEqual({ tetel2: 2 });
  expect(ny(await sorAr(page, 'tetel2').innerText())).toBe('8 000 Ft / db');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 16 000 Ft');
});
