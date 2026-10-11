// 2. Funkcionális tesztek — Árak nézet: orvos és tétel hozzáadása, átnevezése, törlése; a beírt mennyiségek sorsa
// tételtörlésnél és orvos-átnevezésnél; dupla és üres név elutasítása érthető üzenettel.
//
// A HELYES VISELKEDÉS (döntés):
//  - Orvos átnevezése: az azonosító marad → a kiválasztás, a mennyiségek és az árak megmaradnak; a PDF az új nevet írja.
//  - Tétel átnevezése: a beírt mennyisége megmarad.
//  - Tétel törlése (megerősítés után): az árai és a beírt mennyisége is törlődik, a többi mennyiség marad.
//  - A kiválasztott orvos törlése: nincs kiválasztott orvos, a mennyiségek megmaradnak (másik orvoshoz felhasználhatók).
//  - Dupla név (kis/nagybetűtől, ékezettől, szóközöktől eltekintve is) és üres név: elutasítva, az ablak nyitva marad.
import { test, expect, nyit, adatok, valasztas, orvosValaszt, mennyMezo, tetelSor, osszegSzoveg, letoltes } from './segito.js';
import { ny, taroloPillanat, taroltAdat, taroltValasztas, taroltMennyNevvel, nevesAlak, arakMegnyit, listaraVissza, arCella, dlgGomb, dlgNyitva, dlgZarva, ujElemFelvesz, orvosFejGomb, tetelSorGomb, pdfSorok, pdfTetelSor, sorAr } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
async function megnyit(page, { orvos = 'Peti', menny = {}, a = adatok() } = {}) {
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos, menny }), ido: IDO });
  await arakMegnyit(page);
  return a;
}
const nevHiba = page => page.locator('#dlg .mezo-hiba').first();

/* ------------------------------------------------------------ hozzáadás */
test('új orvos (névvel és e-maillel): megjelenik a táblázatban és a választóban, árai még nincsenek', async ({ page }) => {
  await megnyit(page);
  await ujElemFelvesz(page, 'orvos', 'Dr. Szűcs Ádám', { email: 'szucs@rendelo.hu' });
  await dlgZarva(page);
  await expect(page.locator('#arTabla thead .fej-gomb')).toHaveText(['Peti', 'Dani', 'Anna', 'Dr. Szűcs Ádám']);
  await expect(arCella(page, 'tetel1', 'Dr. Szűcs Ádám')).toHaveValue('');
  const a = await taroltAdat(page);
  expect(a.orvosok.map(o => [o.nev, o.email])).toEqual([['Peti', ''], ['Dani', ''], ['Anna', ''], ['Dr. Szűcs Ádám', 'szucs@rendelo.hu']]);
  await expect(page.locator('#mentveJelzo')).toHaveText('Mentve ezen az eszközön.');
  await listaraVissza(page);
  await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(['Peti', 'Dani', 'Anna', 'Dr. Szűcs Ádám']);
  await orvosValaszt(page, 'Dr. Szűcs Ádám');
  await expect(sorAr(page, 'tetel1')).toHaveText('Nincs ára ennél az orvosnál');
});

test('ötödik orvos: a választó legördülő listára vált, a kiválasztás megmarad', async ({ page }) => {
  await megnyit(page, { orvos: 'Anna' });
  await ujElemFelvesz(page, 'orvos', 'Béla');
  await dlgZarva(page);
  await ujElemFelvesz(page, 'orvos', 'Cecília');
  await dlgZarva(page);
  await listaraVissza(page);
  await expect(page.locator('#orvosSelect')).toBeVisible();
  await expect(page.locator('#orvosSelect option:checked')).toHaveText('Anna');
});

test('új tétel csoporttal: megjelenik a táblázatban és a listában, árat kapva számol', async ({ page }) => {
  await megnyit(page, { menny: { tetel1: 1 } });
  await ujElemFelvesz(page, 'tetel', 'Cirkon korona', { csoport: 'Protetika' });
  await dlgZarva(page);
  await expect(page.locator('#arTabla tbody .sor-gomb')).toHaveText(['tetel1', 'tetel2', 'tetel3', 'tetel4', 'Cirkon korona']);
  await expect(page.locator('#arTabla .csoport-sor')).toHaveText(['Egyéb', 'Protetika']);
  // az új tétel első ára-mezője fókuszt kap: ide azonnal írható
  await expect(arCella(page, 'Cirkon korona', 'Peti')).toBeFocused();
  await page.keyboard.type('25000');
  await page.keyboard.press('Enter');
  await expect.poll(async () => nevesAlak(await taroltAdat(page)).tetelek.find(t => t.nev === 'Cirkon korona')).toEqual({ nev: 'Cirkon korona', csoport: 'Protetika', arak: { Peti: 25000 } });
  await listaraVissza(page);
  await expect(page.locator('#tetelLista .csoport-cim')).toHaveText(['Egyéb', 'Protetika']);
  expect(ny(await sorAr(page, 'Cirkon korona').innerText())).toBe('25 000 Ft / db');
  await mennyMezo(page, 'Cirkon korona').fill('2');
  await mennyMezo(page, 'Cirkon korona').press('Enter');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 60 000 Ft');
});

/* ------------------------------------------------------------ átnevezés */
test('orvos átnevezése: a kiválasztás, a mennyiségek és az árak megmaradnak; a PDF és a fájlnév az új nevet írja', async ({ page, context }) => {
  await megnyit(page, { orvos: 'Peti', menny: { tetel1: 2, tetel3: 1 } });
  await orvosFejGomb(page, 'Peti').click();
  const d = await dlgNyitva(page);
  await expect(d.locator('#dlgCim')).toHaveText('Orvos szerkesztése');
  await expect(page.locator('#nevMezo')).toHaveValue('Peti');
  await page.locator('#nevMezo').fill('Dr. Kovács Péter');
  await dlgGomb(page, 'Mentés').click();
  await dlgZarva(page);
  await expect(orvosFejGomb(page, 'Dr. Kovács Péter')).toBeVisible();
  const a = await taroltAdat(page);
  expect(a.orvosok[0]).toEqual({ id: 'o1', nev: 'Dr. Kovács Péter', email: '' });
  expect(nevesAlak(a).tetelek[0].arak).toEqual({ 'Dr. Kovács Péter': 10000, Dani: 15500, Anna: 7650 });
  expect((await taroltValasztas(page)).orvosId).toBe('o1');
  await listaraVissza(page);
  await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Dr. Kovács Péter');
  await expect(mennyMezo(page, 'tetel1')).toHaveValue('2');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 29 000 Ft');
  const { nev, bajtok } = await letoltes(page);
  expect(nev).toBe('Arlista_Dr._Kovács_Péter_2026-10-10.pdf');
  const p = await pdfSorok(context, bajtok);
  expect(p.szoveg).toContain('Címzett: Dr. Kovács Péter');
  expect(p.szoveg).not.toContain('Peti');
});

test('tétel átnevezése: a beírt mennyiség megmarad, a lista és a PDF az új nevet mutatja', async ({ page, context }) => {
  await megnyit(page, { menny: { tetel2: 3 } });
  await tetelSorGomb(page, 'tetel2').click();
  await dlgNyitva(page);
  await expect(page.locator('#dlgCim')).toHaveText('Tétel szerkesztése');
  await page.locator('#nevMezo').fill('Fémkerámia korona');
  await page.locator('#nevMezo').press('Enter');
  await dlgZarva(page);
  await expect(page.locator('#arTabla tbody .sor-gomb')).toHaveText(['tetel1', 'Fémkerámia korona', 'tetel3', 'tetel4']);
  expect(await taroltMennyNevvel(page)).toEqual({ 'Fémkerámia korona': 3 });
  await listaraVissza(page);
  await expect(mennyMezo(page, 'Fémkerámia korona')).toHaveValue('3');
  const { bajtok } = await letoltes(page);
  expect(pdfTetelSor(await pdfSorok(context, bajtok), 'Fémkerámia korona').cellak).toEqual(['Fémkerámia korona', '3 db', '8 000 Ft', '24 000 Ft']);
});

test('átnevezés csak kis/nagybetűben (Peti → PETI) megengedett', async ({ page }) => {
  await megnyit(page);
  await orvosFejGomb(page, 'Peti').click();
  await dlgNyitva(page);
  await page.locator('#nevMezo').fill('PETI');
  await dlgGomb(page, 'Mentés').click();
  await dlgZarva(page);
  expect((await taroltAdat(page)).orvosok[0].nev).toBe('PETI');
});

/* ------------------------------------------------------------ törlés */
test('tétel törlése: megerősítés (hány ár törlődik), az árai és a beírt mennyisége törlődik, a többi marad', async ({ page, context }) => {
  await megnyit(page, { menny: { tetel1: 2, tetel2: 1 } });
  await tetelSorGomb(page, 'tetel1').click();
  await dlgNyitva(page);
  await page.locator('#dlg .gomb-link.veszely', { hasText: 'Tétel törlése' }).click();
  const d = await dlgNyitva(page);
  await expect(d.locator('#dlgCim')).toHaveText('Tétel törlése');
  await expect(d).toContainText('Biztosan törlöd a „tetel1” tételt? A hozzá tartozó 3 ár is törlődik.');
  await dlgGomb(page, 'Törlés').click();
  await dlgZarva(page);
  const a = await taroltAdat(page);
  expect(a.tetelek.map(t => t.nev)).toEqual(['tetel2', 'tetel3', 'tetel4']);
  expect(a.arak.t1).toBeUndefined();
  expect(await taroltMennyNevvel(page)).toEqual({ tetel2: 1 });
  await listaraVissza(page);
  await expect(tetelSor(page, 'tetel1')).toHaveCount(0);
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 8 000 Ft');
  const { bajtok } = await letoltes(page);
  const p = await pdfSorok(context, bajtok);
  expect(pdfTetelSor(p, 'tetel1')).toBeNull();
  expect(pdfTetelSor(p, 'tetel2').osszeg).toBe(8000);
});

test('tétel törlése „Mégse”-vel: semmi nem változik a tárolóban', async ({ page }) => {
  await megnyit(page, { menny: { tetel1: 2 } });
  const elotte = await taroloPillanat(page);
  await tetelSorGomb(page, 'tetel1').click();
  await dlgNyitva(page);
  await page.locator('#dlg .gomb-link.veszely').click();
  await dlgNyitva(page);
  await dlgGomb(page, 'Mégse').click();
  await dlgZarva(page);
  expect(await taroloPillanat(page)).toEqual(elotte);
  await expect(tetelSorGomb(page, 'tetel1')).toBeVisible();
});

test('a kiválasztott orvos törlése: nincs kiválasztott orvos, a mennyiségek megmaradnak, az árai törlődnek', async ({ page }) => {
  await megnyit(page, { orvos: 'Dani', menny: { tetel1: 1, tetel4: 2 } });
  await orvosFejGomb(page, 'Dani').click();
  await dlgNyitva(page);
  await page.locator('#dlg .gomb-link.veszely', { hasText: 'Orvos törlése' }).click();
  const d = await dlgNyitva(page);
  await expect(d).toContainText('Biztosan törlöd a „Dani” orvost? A hozzá tartozó 4 ár is törlődik.');
  await dlgGomb(page, 'Törlés').click();
  await dlgZarva(page);
  const a = await taroltAdat(page);
  expect(a.orvosok.map(o => o.nev)).toEqual(['Peti', 'Anna']);
  expect(Object.values(a.arak).every(r => !('o2' in r))).toBe(true);
  expect((await taroltValasztas(page)).orvosId).toBeNull();
  expect(await taroltMennyNevvel(page)).toEqual({ tetel1: 1, tetel4: 2 });
  await listaraVissza(page);
  await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(['Peti', 'Anna']);
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, válassz orvost');
  await orvosValaszt(page, 'Anna');
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 21 650 Ft');
});

test('ár nélküli orvos törlése: a megerősítés nem ír „0 ár”-at', async ({ page }) => {
  await megnyit(page);
  await ujElemFelvesz(page, 'orvos', 'Üres Orvos');
  await dlgZarva(page);
  await orvosFejGomb(page, 'Üres Orvos').click();
  await dlgNyitva(page);
  await page.locator('#dlg .gomb-link.veszely').click();
  const d = await dlgNyitva(page);
  await expect(d).toContainText('Biztosan törlöd az „Üres Orvos” orvost?');
  await expect(d).not.toContainText('0 ár');
  await dlgGomb(page, 'Törlés').click();
  await dlgZarva(page);
  expect((await taroltAdat(page)).orvosok.map(o => o.nev)).toEqual(['Peti', 'Dani', 'Anna']);
});

/* ------------------------------------------------------------ dupla és üres név */
const DUPLA = [
  ['orvos', 'új', 'Peti'], ['orvos', 'új', 'peti'], ['orvos', 'új', 'Péti'], ['orvos', 'új', '  Peti  '],
  ['tetel', 'új', 'TETEL1'], ['tetel', 'új', 'Tétel1'],
  ['orvos', 'átnevezés', 'Anna'], ['tetel', 'átnevezés', 'tetel4']
];
for (const [fajta, mod, nev] of DUPLA) {
  test(`dupla név (${fajta === 'orvos' ? 'orvos' : 'tétel'}, ${mod}): „${nev}” → „Már van ilyen nevű …”, az ablak nyitva, semmi nem mentődik`, async ({ page }) => {
    await megnyit(page);
    const elotte = await taroloPillanat(page);
    if (mod === 'új') await page.locator(fajta === 'tetel' ? '#ujTetelGomb' : '#ujOrvosGomb').click();
    else await (fajta === 'tetel' ? tetelSorGomb(page, 'tetel1') : orvosFejGomb(page, 'Peti')).click();
    await dlgNyitva(page);
    await page.locator('#nevMezo').fill(nev);
    await dlgGomb(page, mod === 'új' ? 'Hozzáadás' : 'Mentés').click();
    await expect(nevHiba(page)).toBeVisible();
    expect(ny(await nevHiba(page).innerText())).toBe(`Már van ilyen nevű ${fajta === 'orvos' ? 'orvos' : 'tétel'}.`);
    await expect(page.locator('#dlg')).toBeVisible();
    await expect(page.locator('#nevMezo')).toBeFocused();
    await dlgGomb(page, 'Mégse').click();
    await dlgZarva(page);
    expect(await taroloPillanat(page)).toEqual(elotte);
  });
}

for (const [fajta, mod] of [['orvos', 'új'], ['tetel', 'új'], ['orvos', 'átnevezés'], ['tetel', 'átnevezés']]) {
  for (const nev of ['', '    ']) {
    test(`üres név (${fajta === 'orvos' ? 'orvos' : 'tétel'}, ${mod}, „${nev}”): „Adj meg egy nevet.”, semmi nem mentődik`, async ({ page }) => {
      await megnyit(page);
      const elotte = await taroloPillanat(page);
      if (mod === 'új') await page.locator(fajta === 'tetel' ? '#ujTetelGomb' : '#ujOrvosGomb').click();
      else await (fajta === 'tetel' ? tetelSorGomb(page, 'tetel2') : orvosFejGomb(page, 'Dani')).click();
      await dlgNyitva(page);
      await page.locator('#nevMezo').fill(nev);
      await page.locator('#nevMezo').press('Enter');
      await expect(nevHiba(page)).toBeVisible();
      expect(ny(await nevHiba(page).innerText())).toBe('Adj meg egy nevet.');
      await expect(page.locator('#dlg')).toBeVisible();
      await page.keyboard.press('Escape');
      await dlgZarva(page);
      expect(await taroloPillanat(page)).toEqual(elotte);
    });
  }
}

test('a név szélén és belsejében lévő többes szóköz rendbe tétele: „  Dr.   Kiss  Éva ” → „Dr. Kiss Éva”', async ({ page }) => {
  await megnyit(page);
  await ujElemFelvesz(page, 'orvos', '  Dr.   Kiss  Éva ');
  await dlgZarva(page);
  expect((await taroltAdat(page)).orvosok.map(o => o.nev)).toContain('Dr. Kiss Éva');
});

test('hibás e-mail-cím az új orvosnál: hibaüzenet, az orvos nem jön létre', async ({ page }) => {
  await megnyit(page);
  const elotte = await taroloPillanat(page);
  await ujElemFelvesz(page, 'orvos', 'Béla', { email: 'bela@' });
  await expect(page.locator('#dlg .mezo-hiba').filter({ hasText: 'e-mail' })).toHaveText(/Az e-mail-cím formátuma nem jó/);
  await dlgGomb(page, 'Mégse').click();
  await dlgZarva(page);
  expect(await taroloPillanat(page)).toEqual(elotte);
});

test('„Mégse” az új orvos ablakban: semmi nem mentődik', async ({ page }) => {
  await megnyit(page);
  const elotte = await taroloPillanat(page);
  await page.locator('#ujOrvosGomb').click();
  await dlgNyitva(page);
  await page.locator('#nevMezo').fill('Valaki');
  await dlgGomb(page, 'Mégse').click();
  await dlgZarva(page);
  expect(await taroloPillanat(page)).toEqual(elotte);
  await expect(page.locator('#arTabla thead .fej-gomb')).toHaveText(['Peti', 'Dani', 'Anna']);
});
