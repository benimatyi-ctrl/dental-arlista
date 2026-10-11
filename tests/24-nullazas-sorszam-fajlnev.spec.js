// 2. Funkcionális tesztek — nullázás (CONFIG és beállítás), napi sorszám (01-től, növekvő, másnap újra), a kiválasztott
// dátum szerepe, és a fájlnév (Arlista_<Orvos>_<ÉÉÉÉ-HH-NN>.pdf, szóközzel és ékezettel írt névvel is).
import { test, expect, nyit, adatok, valasztas, orvosValaszt, mennyBeir, mennyMezo, osszegSzoveg, letoltes, KULCS } from './segito.js';
import { ny, ftVart, pdfSorok, pdfSorszam, taroltMennyNevvel, taroltValasztas, taroltBeall, arakMegnyit, listaraVissza, dlgNyitva } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const sorszamTar = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KULCS.sorszam);

async function megnyit(page, opciok = {}) {
  const a = opciok.adat || adatok();
  await nyit(page, Object.assign({ adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: opciok.menny || {} }), ido: IDO }, opciok.nyit || {}));
}
// dátum választása: a WebKit a kitöltött dátummező „change” eseményét csak a mező elhagyásakor küldi
async function datumValaszt(page, iso) {
  await page.locator('#datumMezo').fill(iso);
  await page.locator('#datumMezo').blur();
  await expect(page.locator('#datumMezo')).toHaveValue(iso);
  await expect.poll(async () => (await taroltValasztas(page)).datum).toBe(iso);
}

/* ------------------------------------------------------------ nullázás */
test.describe('nullázás a PDF után', () => {
  test('alapból (CONFIG: true) a mennyiségek és a dátum nullázódnak; a „Mennyiségek vissza” mindkettőt visszahozza', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 2, tetel2: 1 } });
    await datumValaszt(page, '2026-10-08');
    await expect(page.locator('#datumTipp')).toBeVisible();
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 28 000 Ft');
    const { nev } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-08.pdf');
    await expect(page.locator('#savKesz')).toBeVisible();
    await expect(mennyMezo(page, 'tetel1')).toHaveValue('0');
    await expect(mennyMezo(page, 'tetel2')).toHaveValue('0');
    expect(await taroltMennyNevvel(page)).toEqual({});
    expect((await taroltValasztas(page)).datum).toBeNull();
    await expect(page.locator('#datumMezo')).toHaveValue('2026-10-10');
    await expect(page.locator('#datumTipp')).toBeHidden();
    await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
    await expect(page.locator('#keszVisszaGomb')).toBeVisible();
    await expect(page.locator('#keszUjGomb')).toHaveText('Új árlista');
    // vissza
    await page.locator('#keszVisszaGomb').click();
    await expect(page.locator('#savKesz')).toBeHidden();
    await expect(mennyMezo(page, 'tetel1')).toHaveValue('2');
    await expect(mennyMezo(page, 'tetel2')).toHaveValue('1');
    await expect(page.locator('#datumMezo')).toHaveValue('2026-10-08');
    expect(await taroltMennyNevvel(page)).toEqual({ tetel1: 2, tetel2: 1 });
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('2 tétel, 28 000 Ft');
    await expect(page.locator('#uzenetek')).toContainText('A mennyiségek visszaálltak.');
  });

  test('CONFIG nullazasGeneralasUtan: false → a mennyiségek megmaradnak, nincs „Mennyiségek vissza”, a gomb „Bezárás”', async ({ page }) => {
    await megnyit(page, { menny: { tetel3: 4 }, nyit: { config: { nullazasGeneralasUtan: false } } });
    await letoltes(page);
    await expect(page.locator('#savKesz')).toBeVisible();
    await expect(page.locator('#keszVisszaGomb')).toBeHidden();
    await expect(page.locator('#keszUjGomb')).toHaveText('Bezárás');
    await expect(mennyMezo(page, 'tetel3')).toHaveValue('4');
    expect(await taroltMennyNevvel(page)).toEqual({ tetel3: 4 });
    await page.locator('#keszUjGomb').click();
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 36 000 Ft');
    // az Árak lapon a kapcsoló a CONFIG szerint ki van kapcsolva
    await arakMegnyit(page);
    await expect(page.locator('#beallNullazas')).not.toBeChecked();
  });

  test('a beállítás (#beallNullazas) kikapcsolva felülírja a CONFIG true-t: nincs nullázás', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 1 } });
    await arakMegnyit(page);
    await expect(page.locator('#beallNullazas')).toBeChecked();
    await page.locator('#beallNullazas').uncheck();
    await expect.poll(async () => taroltBeall(page)).toEqual({ nullazas: false });
    await listaraVissza(page);
    await letoltes(page);
    await expect(page.locator('#keszUjGomb')).toHaveText('Bezárás');
    expect(await taroltMennyNevvel(page)).toEqual({ tetel1: 1 });
  });

  test('a beállítás bekapcsolva felülírja a CONFIG false-t: van nullázás', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 1 }, nyit: { config: { nullazasGeneralasUtan: false } } });
    await arakMegnyit(page);
    await page.locator('#beallNullazas').check();
    await expect.poll(async () => taroltBeall(page)).toEqual({ nullazas: true });
    await listaraVissza(page);
    await letoltes(page);
    await expect(page.locator('#keszVisszaGomb')).toBeVisible();
    expect(await taroltMennyNevvel(page)).toEqual({});
  });
});

/* ------------------------------------------------------------ megosztás (Web Share, utánozva) */
// a tesztböngészőkben nincs fájlmegosztás: a navigator.share/canShare utánzata (ok: sikerül, megszakit: a felhasználó bezárja)
async function megosztasUtanzat(page, mod) {
  await page.addInitScript(mod => {
    window.__megosztasok = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: d => {
      window.__megosztasok.push({ cim: d.title, fajl: d.files && d.files[0] ? d.files[0].name : null });
      return mod === 'ok' ? Promise.resolve() : Promise.reject(new DOMException('A felhasználó bezárta', 'AbortError'));
    } });
  }, mod);
}
test.describe('megosztás után', () => {
  test('sikeres megosztás: nullázás és lefoglalt sorszám, mint a letöltésnél', async ({ page }) => {
    await megosztasUtanzat(page, 'ok');
    await megnyit(page, { menny: { tetel1: 2 } });
    await expect(page.locator('#megosztGomb')).toBeVisible();
    await page.locator('#megosztGomb').click();
    await expect(page.locator('#savKesz')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#keszCim')).toHaveText('Megosztva · sorszám: 20261010-01');
    expect(await page.evaluate(() => window.__megosztasok)).toEqual([{ cim: 'Arlista_Peti_2026-10-10.pdf', fajl: 'Arlista_Peti_2026-10-10.pdf' }]);
    expect(await taroltMennyNevvel(page)).toEqual({});
    expect(await sorszamTar(page)).toEqual({ napok: { 20261010: 1 } });
  });

  test('megszakított megosztás: a mennyiségek megmaradnak, a sorszám nem fogy el (a következő PDF is 01)', async ({ page, context }) => {
    await megosztasUtanzat(page, 'megszakit');
    await megnyit(page, { menny: { tetel1: 2 } });
    await page.locator('#megosztGomb').click();
    await expect(page.locator('#uzenetek')).toContainText('A megosztás megszakadt; a mennyiségek megmaradtak.', { timeout: 60_000 });
    await expect(page.locator('#savKesz')).toBeHidden();
    expect(await taroltMennyNevvel(page)).toEqual({ tetel1: 2 });
    await expect(mennyMezo(page, 'tetel1')).toHaveValue('2');
    const { bajtok } = await letoltes(page);
    expect(pdfSorszam(await pdfSorok(context, bajtok))).toBe('20261010-01');
  });
});

/* ------------------------------------------------------------ sorszám */
test.describe('napi sorszám', () => {
  test('naponta 01-től indul, egymás után növekszik (01, 02, 03), és másnap 01-ről újraindul', async ({ page, context }) => {
    await megnyit(page, { menny: { tetel1: 1 }, nyit: { sorszam: { napok: { 20261009: 7 } } } });
    for (const n of ['01', '02', '03']) {
      const { nev, bajtok } = await letoltes(page);
      expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
      await expect(page.locator('#keszCim')).toHaveText(`Letöltve · sorszám: 20261010-${n}`);
      const p = await pdfSorok(context, bajtok);
      expect(pdfSorszam(p), `a(z) ${n}. PDF sorszáma`).toBe(`20261010-${n}`);
      await page.locator('#keszUjGomb').click();
      await mennyBeir(page, 'tetel2', Number(n) + 1);
    }
    expect(await sorszamTar(page)).toEqual({ napok: { 20261009: 7, 20261010: 3 } });
    // másnap
    await page.clock.setFixedTime(new Date('2026-10-11T08:00:00'));
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-11.pdf');
    await expect(page.locator('#keszCim')).toHaveText('Letöltve · sorszám: 20261011-01');
    const p = await pdfSorok(context, bajtok);
    expect(pdfSorszam(p)).toBe('20261011-01');
    expect(p.szoveg).toContain('2026.10.11.');
    expect(await sorszamTar(page)).toEqual({ napok: { 20261009: 7, 20261010: 3, 20261011: 1 } });
  });

  test('a kiválasztott dátum adja a sorszámot, a fájlnevet, a PDF dátumát és az érvényességet; a mai számláló külön fut', async ({ page, context }) => {
    await megnyit(page, { menny: { tetel1: 1 } });
    await datumValaszt(page, '2026-10-05');
    await expect(page.locator('#datumTipp')).toHaveText('Nem a mai dátum: ez kerül a PDF-re, a fájlnévbe és a sorszámba.');
    let r = await letoltes(page);
    expect(r.nev).toBe('Arlista_Peti_2026-10-05.pdf');
    let p = await pdfSorok(context, r.bajtok);
    expect(pdfSorszam(p)).toBe('20261005-01');
    expect(p.szoveg).toContain('2026.10.05.');
    expect(p.szoveg).toContain('2026.11.04-ig érvényes');
    // ugyanarra a napra még egy (a nullázás a dátumot is visszaállította: újra ki kell választani)
    await page.locator('#keszUjGomb').click();
    await mennyBeir(page, 'tetel1', 2);
    await datumValaszt(page, '2026-10-05');
    r = await letoltes(page);
    p = await pdfSorok(context, r.bajtok);
    expect(pdfSorszam(p)).toBe('20261005-02');
    // a mai nap számlálója független
    await page.locator('#keszUjGomb').click();
    await mennyBeir(page, 'tetel1', 3);
    await expect(page.locator('#datumMezo')).toHaveValue('2026-10-10');
    r = await letoltes(page);
    p = await pdfSorok(context, r.bajtok);
    expect(pdfSorszam(p)).toBe('20261010-01');
    expect(r.nev).toBe('Arlista_Peti_2026-10-10.pdf');
    expect(await sorszamTar(page)).toEqual({ napok: { 20261005: 2, 20261010: 1 } });
  });

  test('az előnézet nem foglal sorszámot: utána a letöltött PDF is 01', async ({ page, context }) => {
    await megnyit(page, { menny: { tetel4: 1 } });
    await page.locator('#elonezetGomb').click();
    const d = await dlgNyitva(page);
    await expect(d).toContainText('A sorszám (20261010-01) a letöltéskor vagy megosztáskor válik véglegessé.');
    await expect(d.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await d.locator('.dlg-zar').click();
    await expect(page.locator('#dlg')).toBeHidden();
    expect(await sorszamTar(page)).toBeNull();
    const { bajtok } = await letoltes(page);
    expect(pdfSorszam(await pdfSorok(context, bajtok))).toBe('20261010-01');
  });

  test('a „Mennyiségek vissza” után újra letöltve új sorszámot kap (02)', async ({ page, context }) => {
    await megnyit(page, { menny: { tetel1: 1 } });
    await letoltes(page);
    await page.locator('#keszVisszaGomb').click();
    const { bajtok } = await letoltes(page);
    expect(pdfSorszam(await pdfSorok(context, bajtok))).toBe('20261010-02');
  });

  test('dupla kattintás a letöltésre: egy fájl, egy lefoglalt sorszám', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 1 }, nyit: { config: { nullazasGeneralasUtan: false } } });
    const letoltesek = [];
    page.on('download', d => letoltesek.push(d.suggestedFilename()));
    await page.locator('#letoltGomb').dblclick();
    await expect(page.locator('#savKesz')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => letoltesek.length).toBe(1);
    await page.waitForTimeout(1500);                 // a második kattintás sem indíthat későbbi letöltést
    expect(letoltesek).toEqual(['Arlista_Peti_2026-10-10.pdf']);
    expect(await sorszamTar(page)).toEqual({ napok: { 20261010: 1 } });
  });

  test('a „Ma” gomb a választott napról visszaáll a mai napra (a PDF, a fájlnév és a sorszám is a maié)', async ({ page, context }) => {
    await megnyit(page, { menny: { tetel1: 1 } });
    await expect(page.locator('#maGomb')).toBeHidden();
    await datumValaszt(page, '2026-10-08');
    await expect(page.locator('#maGomb')).toBeVisible();
    await page.locator('#maGomb').click();
    await expect(page.locator('#datumMezo')).toHaveValue('2026-10-10');
    await expect(page.locator('#datumSzoveg')).toContainText('(ma)');
    await expect(page.locator('#maGomb')).toBeHidden();
    await expect(page.locator('#datumTipp')).toBeHidden();
    await expect.poll(async () => (await taroltValasztas(page)).datum).toBeNull();
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
    expect(pdfSorszam(await pdfSorok(context, bajtok))).toBe('20261010-01');
  });

  test('„Letöltés újra” a kész panelen: ugyanaz a fájl, nem fogy új sorszám', async ({ page }) => {
    await megnyit(page, { menny: { tetel2: 2 } });
    const elso = await letoltes(page);
    await expect(page.locator('#keszCim')).toHaveText('Letöltve · sorszám: 20261010-01');
    await expect(page.locator('#keszLetoltGomb')).toBeVisible();
    const masodik = await letoltes(page, '#keszLetoltGomb');
    expect(masodik.nev).toBe(elso.nev);
    expect(Buffer.compare(masodik.bajtok, elso.bajtok), 'bájtra ugyanaz a PDF').toBe(0);
    expect(await sorszamTar(page)).toEqual({ napok: { 20261010: 1 } });
    await expect(page.locator('#keszCim')).toHaveText('Letöltve · sorszám: 20261010-01');
  });

  test('[FUN-05] éjfél után (nyitva hagyott lap) a dátummező és a felirat a PDF napját mutatja, nem a tegnapit „(ma)”-ként', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 1 }, nyit: { ido: '2026-10-10T23:58:00' } });
    await expect(page.locator('#datumSzoveg')).toContainText('október 10.');
    await page.clock.setFixedTime(new Date('2026-10-11T00:02:00'));
    await mennyBeir(page, 'tetel1', 2);              // a felhasználó tovább dolgozik a lapon
    await expect(page.locator('#datumMezo'), 'a PDF már 2026-10-11-es lesz').toHaveValue('2026-10-11');
    await expect(page.locator('#datumSzoveg')).toContainText('október 11.');
    const { nev } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-11.pdf');
  });
});

/* ------------------------------------------------------------ fájlnév */
test.describe('fájlnév', () => {
  test('szóközzel és ékezettel írt orvosnév: „Dr. Szűcs Ádám” → Arlista_Dr._Szűcs_Ádám_2026-10-10.pdf, a PDF-ben „Címzett: Dr. Szűcs Ádám”', async ({ page, context }) => {
    const a = adatok({ orvosok: ['Peti', 'Dr. Szűcs Ádám'], tetelek: [['Cirkon korona', [25000, 27500]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Dr. Szűcs Ádám', menny: { 'Cirkon korona': 2 } }), ido: IDO });
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Dr._Szűcs_Ádám_2026-10-10.pdf');
    expect(nev.normalize('NFC')).toBe(nev);
    await expect(page.locator('#keszFajl')).toHaveText('Arlista_Dr._Szűcs_Ádám_2026-10-10.pdf');
    const p = await pdfSorok(context, bajtok);
    expect(p.szoveg).toContain('Címzett: Dr. Szűcs Ádám');
    expect(p.szoveg).not.toContain('Dr. Dr.');
    expect(p.szoveg).toContain(ftVart(55000));
  });

  test('„Dr.” nélküli ékezetes név: „Őri Ödön” → Arlista_Őri_Ödön_…, Címzett: Dr. Őri Ödön', async ({ page, context }) => {
    const a = adatok({ orvosok: ['Őri Ödön'], tetelek: [['Korona', [1000]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { Korona: 1 } }), ido: IDO });
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Őri_Ödön_2026-10-10.pdf');
    expect((await pdfSorok(context, bajtok)).szoveg).toContain('Címzett: Dr. Őri Ödön');
  });

  test('fájlnévben tiltott jelek (/ : " ?) nem kerülnek a fájlnévbe', async ({ page }) => {
    const a = adatok({ orvosok: ['Kiss/Nagy: "Bt"?'], tetelek: [['Korona', [1000]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { Korona: 1 } }), ido: IDO });
    const { nev } = await letoltes(page);
    expect(nev).toBe('Arlista_Kiss_Nagy_Bt_2026-10-10.pdf');
  });

  test('orvosváltás után a fájlnév az új orvosé', async ({ page }) => {
    await megnyit(page, { menny: { tetel1: 1 }, nyit: { config: { nullazasGeneralasUtan: false } } });
    let r = await letoltes(page);
    expect(r.nev).toBe('Arlista_Peti_2026-10-10.pdf');
    await page.locator('#keszUjGomb').click();
    await orvosValaszt(page, 'Anna');
    r = await letoltes(page);
    expect(r.nev).toBe('Arlista_Anna_2026-10-10.pdf');
    await expect(page.locator('#keszCim')).toHaveText('Letöltve · sorszám: 20261010-02');
  });
});
