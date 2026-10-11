// 2. Funkcionális tesztek — Excel-import: a vba.xlsm, egy jó .xlsx, rossz szerkezetű fájlok (nincs Adatbázis lap,
// üres lap, szöveg az ár helyén, üres cellák, dupla tétel), nem Excel fájlok. Az előnézet jól mutatja-e a változásokat,
// a „Mégse” után semmi nem íródik-e felül (a tároló bájtra azonos), az „Árak felülírása” alkalmaz, a „Visszavonás” visszaállít.
import fs from 'node:fs';
import { test, expect, nyit, adatok, valasztas, mennyMezo, osszegSzoveg, orvosValaszt } from './segito.js';
import { ny, ADATBAZIS, VBA_XLSM, excelFajl, xlsxKeszit, taroloPillanat, taroltAdat, taroltValasztas, taroltMennyNevvel, nevesAlak, arakMegnyit, listaraVissza, fajlValaszt, dlgGomb, dlgNyitva, dlgZarva, sorAr } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const HIBA_CIM = 'Az Excel-fájl nem tölthető be';

async function megnyit(page, { a = adatok(), orvos = 'Peti', menny = {} } = {}) {
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos, menny }), ido: IDO });
  await arakMegnyit(page);
}
async function importal(page, fajl) {
  await fajlValaszt(page, '#excelGomb', fajl);
  const d = await dlgNyitva(page);
  await expect(d.locator('#dlgCim')).not.toHaveText('Excel beolvasása', { timeout: 30_000 });   // a „folyamatban” ablak után
  return d;
}
const cimkek = d => d.locator('.cimkek').first().locator('.cimke');
async function cimkeSzovegek(d) { return (await cimkek(d).allInnerTexts()).map(ny); }
async function reszLista(d, cim) {
  const blokk = d.locator('div').filter({ has: d.page().locator('p.alcim', { hasText: new RegExp('^' + cim) }) }).last();
  return (await blokk.locator('.cimke').allInnerTexts()).map(ny);
}
async function valtozasok(d) { return (await d.locator('ul.lista-valtozas li').allInnerTexts()).map(ny); }

/* ------------------------------------------------------------ a vba.xlsm */
test.describe('a vba.xlsm (a makrós munkafüzet)', () => {
  test.skip(!fs.existsSync(VBA_XLSM), 'A tests/fixtures/privat/vba.xlsm nincs meg (nem nyilvános fájl, a tárolóban nincs benne); másold ide a _fejlesztes/teszt-fajlok/vba.xlsm-et.');

  test('a beépített adatok mellett: „nincs mit frissíteni”, csak „Bezárás”, a tároló nem változik', async ({ page }) => {
    await megnyit(page);
    const elotte = await taroloPillanat(page);
    const d = await importal(page, VBA_XLSM);
    await expect(d.locator('#dlgCim')).toHaveText('Excel-import előnézete');
    await expect(d).toContainText('vba.xlsm · „Adatbázis” lap');
    expect(await cimkeSzovegek(d)).toEqual(['3 orvos', '4 tétel', 'Nincs árváltozás']);
    await expect(d).toContainText('Az árak megegyeznek a jelenlegiekkel; nincs mit frissíteni.');
    await expect(d.locator('.dlg-lab button')).toHaveText(['Bezárás']);
    await dlgGomb(page, 'Bezárás').click();
    await dlgZarva(page);
    expect(await taroloPillanat(page)).toEqual(elotte);
  });

  test('módosított árak után: az előnézet a régi → új árat mutatja, a felülírás az Adatbázis lap árait tölti be', async ({ page }) => {
    const a = adatok({ tetelek: [['tetel1', [11000, 15500, 7650]], ['tetel2', [8000, 13100, null]], ['tetel3', [9000, 1000, 6000]], ['tetel4', [10000, 2000, 7000]]] });
    await megnyit(page, { a });
    const d = await importal(page, VBA_XLSM);
    expect(await cimkeSzovegek(d)).toEqual(['3 orvos', '4 tétel', '2 ár változik']);
    expect(await valtozasok(d)).toEqual(['tetel1 · Peti 11 000 Ft → 10 000 Ft', 'tetel2 · Anna nincs ár → 5 000 Ft']);
    await dlgGomb(page, 'Árak felülírása').click();
    await dlgZarva(page);
    const n = nevesAlak(await taroltAdat(page));
    expect(n.orvosok.map(o => o.nev)).toEqual(ADATBAZIS.orvosok);
    for (const t of n.tetelek) expect(ADATBAZIS.orvosok.map(o => t.arak[o]), t.nev).toEqual(ADATBAZIS.arak[t.nev]);
  });
});

/* ------------------------------------------------------------ jó .xlsx: arak_valtozott.xlsx */
test.describe('jó .xlsx (arak_valtozott.xlsx)', () => {
  test('az előnézet mutatja a darabszámokat, a változó árakat, az új és a törlődő elemeket', async ({ page }) => {
    await megnyit(page);
    const d = await importal(page, excelFajl('arak_valtozott.xlsx'));
    await expect(d).toContainText('arak_valtozott.xlsx · „Adatbázis” lap');
    expect(await cimkeSzovegek(d)).toEqual(['4 orvos', '4 tétel', '1 tétel törlődik', '2 ár változik', '1 új orvos', '1 új tétel']);
    expect(await reszLista(d, 'Törlődő tétel')).toEqual(['tetel4']);
    expect(await valtozasok(d)).toEqual(['tetel1 · Anna 7 650 Ft → 7 900 Ft', 'tetel3 · Dani 1 000 Ft → 1 100 Ft']);
    expect(await reszLista(d, 'Új orvos')).toEqual(['Dr. Kovács Ő']);
    expect(await reszLista(d, 'Új tétel')).toEqual(['Kerámia héj – ő ű Ő Ű']);
    await expect(d.locator('.dlg-lab button')).toHaveText(['Mégse', 'Felülírás (1 törlődik)']);
  });

  test('„Mégse”: a tároló bájtra azonos marad, az árak és a mennyiségek nem változnak', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 2, tetel4: 1 } });
    const elotte = await taroloPillanat(page);
    await importal(page, excelFajl('arak_valtozott.xlsx'));
    await dlgGomb(page, 'Mégse').click();
    await dlgZarva(page);
    expect(await taroloPillanat(page)).toEqual(elotte);
    await expect(page.locator('#importVisszaGomb')).toBeHidden();
    await expect(page.locator('#arTabla tbody .sor-gomb')).toHaveText(['tetel1', 'tetel2', 'tetel3', 'tetel4']);
  });

  test('Esc / háttérre koppintás is „Mégse”: semmi nem íródik felül', async ({ page }) => {
    await megnyit(page);
    const elotte = await taroloPillanat(page);
    await importal(page, excelFajl('arak_valtozott.xlsx'));
    await page.keyboard.press('Escape');
    await dlgZarva(page);
    expect(await taroloPillanat(page)).toEqual(elotte);
  });

  test('„Felülírás”: az Excel árai kerülnek be; a törölt tétel mennyisége törlődik, a többi marad, a lista az új árral számol', async ({ page }) => {
    const a = adatok();
    await megnyit(page, { a, orvos: 'Anna', menny: { tetel1: 2, tetel4: 1 } });
    await importal(page, excelFajl('arak_valtozott.xlsx'));
    await dlgGomb(page, 'Felülírás (1 törlődik)').click();
    await dlgZarva(page);
    await expect(page.locator('#uzenetek')).toContainText('Árak frissítve: 4 orvos, 4 tétel.');
    const n = nevesAlak(await taroltAdat(page));
    expect(n.orvosok.map(o => o.nev)).toEqual(['Peti', 'Dani', 'Anna', 'Dr. Kovács Ő']);
    expect(n.tetelek).toEqual([
      { nev: 'tetel1', csoport: '', arak: { Peti: 10000, Dani: 15500, Anna: 7900, 'Dr. Kovács Ő': 12000 } },
      { nev: 'tetel2', csoport: '', arak: { Peti: 8000, Dani: 13100, Anna: 5000, 'Dr. Kovács Ő': 9500 } },
      { nev: 'tetel3', csoport: '', arak: { Peti: 9000, Dani: 1100, Anna: 6000, 'Dr. Kovács Ő': 8800 } },
      { nev: 'Kerámia héj – ő ű Ő Ű', csoport: '', arak: { Peti: 85000, Dani: 92000, Anna: 78000, 'Dr. Kovács Ő': 88000 } }
    ]);
    expect(await taroltMennyNevvel(page)).toEqual({ tetel1: 2 });
    expect((await taroltValasztas(page)).orvosId).toBe('o3');
    await expect(page.locator('#importVisszaGomb')).toBeVisible();
    await listaraVissza(page);
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 15 800 Ft');
  });

  test('„Visszavonás” (az értesítés gombja, 8 mp-ig látszik): az árak, a törölt tétel mennyisége és a kiválasztás is visszaáll', async ({ page }) => {
    const a = adatok();
    await megnyit(page, { a, orvos: 'Anna', menny: { tetel1: 2, tetel4: 1 } });
    const eredeti = nevesAlak(await taroltAdat(page));
    await importal(page, excelFajl('arak_valtozott.xlsx'));
    await dlgGomb(page, 'Felülírás (1 törlődik)').click();
    // azonnal: az értesítés 8 mp múlva magától eltűnik (utána az Árak lap gombja marad, lásd a következő tesztet)
    await page.locator('#uzenetek .uzenet', { hasText: 'Árak frissítve' }).locator('button', { hasText: 'Visszavonás' }).click();
    await expect(page.locator('#uzenetek')).toContainText('A betöltés előtti árak visszaálltak.');
    expect(nevesAlak(await taroltAdat(page))).toEqual(eredeti);
    expect(await taroltMennyNevvel(page)).toEqual({ tetel1: 2, tetel4: 1 });
    expect((await taroltValasztas(page)).orvosId).toBe('o3');
    expect(await page.evaluate(() => localStorage.getItem('dentAl.betoltesElotti.v1'))).toBeNull();
    await expect(page.locator('#importVisszaGomb')).toBeHidden();
    await listaraVissza(page);
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 22 300 Ft');
  });

  test('„Visszaállítás az utolsó betöltés előtti árakra” gomb (megerősítéssel) is visszaállít', async ({ page }) => {
    await megnyit(page);
    const eredeti = nevesAlak(await taroltAdat(page));
    await importal(page, excelFajl('arak_valtozott.xlsx'));
    await dlgGomb(page, 'Felülírás (1 törlődik)').click();
    await dlgZarva(page);
    await page.locator('#importVisszaGomb').click();
    const d = await dlgNyitva(page);
    await expect(d).toContainText('Az árak visszaállnak a legutóbbi betöltés előtti állapotra');
    await dlgGomb(page, 'Visszaállítás').click();
    await dlgZarva(page);
    expect(nevesAlak(await taroltAdat(page))).toEqual(eredeti);
    await expect(page.locator('#importVisszaGomb')).toBeHidden();
  });
});

/* ------------------------------------------------------------ üres cellák, csoportok, szöveges számok */
test('üres cellák (ures_arak.xlsx): figyelmeztetés a kimaradó oszlopra és sorra; a törlődés a gombon is látszik', async ({ page }) => {
  await megnyit(page);
  const elotte = await taroloPillanat(page);
  const d = await importal(page, excelFajl('ures_arak.xlsx'));
  expect(await cimkeSzovegek(d)).toEqual(['2 orvos', '3 tétel', '1 orvos törlődik', '1 tétel törlődik', 'Nincs árváltozás']);
  await expect(d.locator('.figyelmeztetes')).toContainText('A C oszlopban vannak árak, de az 1. sorban nincs orvosnév, ezért kimarad.');
  await expect(d.locator('.figyelmeztetes')).toContainText('A 4. sorban vannak árak, de az A oszlopban nincs tételnév, ezért kimarad.');
  expect(await reszLista(d, 'Törlődő orvos')).toEqual(['Dani']);
  expect(await reszLista(d, 'Törlődő tétel')).toEqual(['tetel3']);
  await expect(d.locator('.dlg-lab button')).toHaveText(['Mégse', 'Felülírás (2 törlődik)']);
  await dlgGomb(page, 'Mégse').click();
  await dlgZarva(page);
  expect(await taroloPillanat(page)).toEqual(elotte);
});

test('üres árcella: az orvosnak arra a tételre nincs ára — az előnézetben „→ nincs ár”, betöltés után „Nincs ára”', async ({ page }) => {
  await megnyit(page);
  const fajl = xlsxKeszit('ures_cella.xlsx', { 'Adatbázis': [[null, 'Peti', 'Dani', 'Anna'], ['tetel1', 10000, 15500, 7650], ['tetel2', null, 13100, 5000], ['tetel3', 9000, 1000, 6000], ['tetel4', 10000, 2000, 7000]] });
  const d = await importal(page, fajl);
  expect(await valtozasok(d)).toEqual(['tetel2 · Peti 8 000 Ft → nincs ár']);
  await dlgGomb(page, 'Árak felülírása').click();
  await dlgZarva(page);
  await listaraVissza(page);
  await orvosValaszt(page, 'Peti');
  await expect(sorAr(page, 'tetel2')).toHaveText('Nincs ára ennél az orvosnál');
});

test('szövegként írt, de helyes árak („10 000 Ft”, „7.650”, „8000”) számként töltődnek be', async ({ page }) => {
  await megnyit(page);
  const fajl = xlsxKeszit('szoveges_jo.xlsx', { 'Adatbázis': [[null, 'Peti', 'Dani', 'Anna'], ['tetel1', '10 000 Ft', '15 500', '7.650'], ['tetel2', '8000', 13100, 5000], ['tetel3', 9000, '1 000,00', 6000], ['tetel4', 10000, 2000, '7 000 HUF']] });
  const d = await importal(page, fajl);
  expect(await cimkeSzovegek(d)).toEqual(['3 orvos', '4 tétel', 'Nincs árváltozás']);
  await expect(d).toContainText('nincs mit frissíteni');
});

test('a régi .xls formátum is működik (README): az előnézet és a felülírás ugyanúgy, mint .xlsx-nél', async ({ page }) => {
  await megnyit(page);
  const fajl = xlsxKeszit('arak_regi.xls', { 'Adatbázis': [[null, 'Peti', 'Dani', 'Anna'], ['tetel1', 10000, 15500, 7650], ['tetel2', 8000, 13100, 5000], ['tetel3', 9000, 1000, 6000], ['tetel4', 10000, 2000, 7100]] }, { bookType: 'biff8' });
  fajl.mimeType = 'application/vnd.ms-excel';
  expect(fajl.buffer.subarray(0, 4).toString('hex'), 'valódi régi (OLE) Excel-fájl').toBe('d0cf11e0');
  const d = await importal(page, fajl);
  await expect(d.locator('#dlgCim')).toHaveText('Excel-import előnézete');
  await expect(d).toContainText('arak_regi.xls · „Adatbázis” lap');
  expect(await valtozasok(d)).toEqual(['tetel4 · Anna 7 000 Ft → 7 100 Ft']);
  await dlgGomb(page, 'Árak felülírása').click();
  await dlgZarva(page);
  expect(nevesAlak(await taroltAdat(page)).tetelek[3].arak.Anna).toBe(7100);
});

test('csoportsorok („Protetika:”) csoportként töltődnek be, és a listában is csoportcímként jelennek meg', async ({ page }) => {
  await megnyit(page);
  const fajl = xlsxKeszit('csoportos.xlsx', { 'Adatbázis': [[null, 'Peti'], ['Rögzített pótlások:'], ['Cirkon korona', 25000], ['Fémkerámia', 17000], ['Protetika:'], ['Teljes fogsor', 70000]] });
  const d = await importal(page, fajl);
  expect(await cimkeSzovegek(d)).toEqual(['1 orvos', '3 tétel', '2 orvos törlődik', '4 tétel törlődik', 'Nincs árváltozás', '3 új tétel']);
  await dlgGomb(page, 'Felülírás (6 törlődik)').click();
  await dlgZarva(page);
  expect(nevesAlak(await taroltAdat(page)).tetelek.map(t => [t.nev, t.csoport])).toEqual([['Cirkon korona', 'Rögzített pótlások'], ['Fémkerámia', 'Rögzített pótlások'], ['Teljes fogsor', 'Protetika']]);
  await listaraVissza(page);
  await expect(page.locator('#tetelLista .csoport-cim')).toHaveText(['Rögzített pótlások', 'Protetika']);
  // egyetlen orvos maradt: magától kiválasztva
  await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Peti');
});

test('NFD-s, szóközös lapnév („Adatbázis ”) is megtalálható; az előnézet a rendes nevet írja', async ({ page }) => {
  await megnyit(page);
  const d = await importal(page, excelFajl('extra_lapnev_nfd.xlsx'));
  await expect(d).toContainText('extra_lapnev_nfd.xlsx · „Adatbázis” lap');
  await expect(d).toContainText('nincs mit frissíteni');
});

test('sok tétel (sok_tetel.xlsx): az előnézet a 12 első nevet mutatja, a többi egy gombbal nyílik', async ({ page }) => {
  await megnyit(page);
  const d = await importal(page, excelFajl('sok_tetel.xlsx'));
  expect(await cimkeSzovegek(d)).toEqual(['3 orvos', '45 tétel', '3 orvos törlődik', '4 tétel törlődik', 'Nincs árváltozás', '3 új orvos', '45 új tétel']);
  const tobb = d.locator('button.gomb-link', { hasText: '…és még 33' });
  await expect(tobb).toBeVisible();
  await tobb.click();
  expect((await reszLista(d, 'Új tétel')).length).toBe(45);
  await dlgGomb(page, 'Mégse').click();
});

/* ------------------------------------------------------------ hibás fájlok: hibaüzenet, semmi nem íródik felül */
const ROSSZ = [
  ['nincs Adatbázis lap (nincs_adatbazis.xlsx)', () => excelFajl('nincs_adatbazis.xlsx'),
    /^A munkafüzetben nincs „Adatbázis” nevű lap \(a lapok: Munka1\)\. Nevezd át az árakat tartalmazó lapot „Adatbázis”-ra, majd töltsd be újra\.$/, null],
  ['üres Adatbázis lap', () => xlsxKeszit('ures_lap.xlsx', { 'Adatbázis': [] }),
    /Adatbázis” lap.*(üres|nincsenek orvosnevek).*B1-től jobbra.*A2-től lefelé.*töltsd be újra/, null],
  ['csak fejléc, tétel nélkül', () => xlsxKeszit('csak_fejlec.xlsx', { 'Adatbázis': [[null, 'Peti', 'Dani']] }),
    /A oszlopában \(A2-től lefelé\) nincsenek tételnevek\..*töltsd be újra/, null],
  ['tételek orvosnév nélkül', () => xlsxKeszit('nincs_orvos.xlsx', { 'Adatbázis': [[null], ['tetel1', 100], ['tetel2', 200]] }),
    /1\. sorában \(B1-től jobbra\) nincsenek orvosnevek\./, null],
  ['szöveg az ár helyén (szoveges_arak.xlsx)', () => excelFajl('szoveges_arak.xlsx'),
    /^Az „Adatbázis” lapon 1 hiba van, ezért az árak nem változtak\. Javítsd ezeket az Excelben, majd töltsd be újra\.$/, ['C4: „abc” nem szám.']],
  ['dupla tétel (dupla_tetel.xlsx)', () => excelFajl('dupla_tetel.xlsx'),
    /1 hiba van, ezért az árak nem változtak/, ['„tetel2” kétszer szerepel az A oszlopban (A3 és A5).']],
  ['negatív és túl nagy ár', () => xlsxKeszit('rossz_szamok.xlsx', { 'Adatbázis': [[null, 'Peti', 'Dani'], ['tetel1', -5, 100], ['tetel2', 100, 1e9]] }),
    /2 hiba van/, ['B2: negatív vagy érvénytelen ár (-5).', 'C3: túl nagy ár (1 000 000 000); legfeljebb 99 999 999 Ft lehet.']],
  ['dupla orvosnév', () => xlsxKeszit('dupla_orvos.xlsx', { 'Adatbázis': [[null, 'Peti', 'peti'], ['tetel1', 1, 2]] }),
    /1 hiba van/, ['„peti” kétszer szerepel az 1. sorban (B1 és C1).']],
  ['képlet elmentett eredmény nélkül (extra_keplet_nocache.xlsx)', () => excelFajl('extra_keplet_nocache.xlsx'),
    /hiba van, ezért az árak nem változtak/, null],
  ['jelszóval védett munkafüzet', () => excelFajl('extra_jelszavas_excel.xlsx'),
    /^A munkafüzet jelszóval védett\. Mentsd el jelszó nélkül, majd töltsd be újra\.$/, null],
  ['szövegfájl .xlsx kiterjesztéssel (hibas.xlsx)', () => excelFajl('hibas.xlsx'),
    /^Ez a fájl nem Excel-munkafüzet\. Válassz \.xlsx vagy \.xlsm fájlt\.$/, null],
  ['PDF .xlsx kiterjesztéssel', () => excelFajl('extra_pdf.xlsx'),
    /^Ez a fájl nem Excel-munkafüzet\. Válassz \.xlsx vagy \.xlsm fájlt\.$/, null],
  ['szövegfájl (.txt)', () => ({ name: 'arlista.txt', mimeType: 'text/plain', buffer: Buffer.from('Peti;Dani\ntetel1;10000;15500\n', 'utf8') }),
    /^Ez a fájl nem Excel-munkafüzet\. Válassz \.xlsx vagy \.xlsm fájlt\.$/, null],
  ['üres (0 bájtos) fájl', () => excelFajl('extra_ures_0bajt.xlsx'),
    /^Ez a fájl nem Excel-munkafüzet\. Válassz \.xlsx vagy \.xlsm fájlt\.$/, null],
  ['Word-dokumentum .xlsx kiterjesztéssel', () => excelFajl('extra_docx.xlsx'),
    /^Ez a fájl nem olvasható Excel-munkafüzetként\. Válassz \.xlsx vagy \.xlsm fájlt\.$/, null]
];
for (const [cim, fajl, uzenet, reszletek] of ROSSZ) {
  test(`hibás fájl — ${cim}: érthető hibaüzenet a teendővel, a tároló bájtra azonos`, async ({ page }) => {
    await megnyit(page, { menny: { tetel2: 3 } });
    const elotte = await taroloPillanat(page);
    const d = await importal(page, fajl());
    await expect(d.locator('#dlgCim')).toHaveText(HIBA_CIM);
    const leiras = ny(await d.locator('#dlgLeiras').innerText());
    expect(leiras).toMatch(uzenet);
    expect(leiras, 'ne angol könyvtári hibaüzenet jelenjen meg').not.toMatch(/\b(Error|undefined|null|Unsupported|workbook|Could not)\b/);
    if (reszletek) expect(await valtozasok(d)).toEqual(reszletek);
    await dlgGomb(page, 'Rendben').click();
    await dlgZarva(page);
    expect(await taroloPillanat(page)).toEqual(elotte);
    await expect(page.locator('#importVisszaGomb')).toBeHidden();
    // ugyanaz a fájlválasztó utána is használható (a value törlődött)
    expect(await page.locator('#excelFajl').inputValue()).toBe('');
  });
}

test('a képlet nélküli eredmény hibája megmondja a cellát és a teendőt', async ({ page }) => {
  await megnyit(page);
  const d = await importal(page, excelFajl('extra_keplet_nocache.xlsx'));
  const lista = await valtozasok(d);
  expect(lista.length).toBeGreaterThan(0);
  for (const s of lista) expect(s).toMatch(/^[A-Z]+\d+: a képletnek nincs elmentett eredménye\. Nyisd meg a fájlt Excelben, mentsd el, és töltsd be újra\.$/);
});

test('a jó fájl a hibás után is betölthető (ugyanaz a fájlválasztó)', async ({ page }) => {
  await megnyit(page);
  await importal(page, excelFajl('hibas.xlsx'));
  await dlgGomb(page, 'Rendben').click();
  await dlgZarva(page);
  const d = await importal(page, excelFajl('arak_valtozott.xlsx'));
  await expect(d.locator('#dlgCim')).toHaveText('Excel-import előnézete');
  await dlgGomb(page, 'Mégse').click();
  await dlgZarva(page);
  await expect(mennyMezo(page, 'tetel1')).toHaveCount(1);
});
