// 2. Funkcionális tesztek — hibaágak: nincs orvos kiválasztva, minden mennyiség 0, nincs orvos / tétel az adatokban.
// A hibaüzenet érthető-e, és megmondja-e a teendőt; a PDF nem készülhet el, és nem is töltődhet le.
import { test, expect, nyit, adatok, valasztas, orvosValaszt, mennyBeir, osszegSzoveg, letoltes } from './segito.js';
import { ny } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const TEENDO = /^(Válassz|Adj meg|Vegyél fel)\b/;   // a hibaüzenet felszólítással kezdődik: megmondja, mit tegyen

// letöltés-figyelő: a hibaágakon egyetlen fájl sem töltődhet le
function letoltesFigyelo(page) {
  const f = { db: 0 };
  page.on('download', () => { f.db++; });
  return f;
}
const GOMBOK = [['PDF letöltése', '#letoltGomb'], ['Előnézet', '#elonezetGomb'], ['Gmail', '#gmailGomb']];

test.describe('nincs orvos kiválasztva', () => {
  for (const [gombNev, gomb] of GOMBOK) {
    test(`${gombNev}: „Válassz orvost a PDF elkészítéséhez.” az orvosválasztónál, fókusz az első orvoson, nincs PDF`, async ({ page }) => {
      const a = adatok();
      await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { tetel1: 2 } }), ido: IDO });
      const f = letoltesFigyelo(page);
      await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, válassz orvost');
      await expect(page.locator('#orvosTipp')).toBeVisible();
      await page.locator(gomb).click();
      const h = page.locator('#orvosHiba');
      await expect(h).toBeVisible();
      expect(ny(await h.innerText())).toBe('Válassz orvost a PDF elkészítéséhez.');
      expect(ny(await h.innerText())).toMatch(TEENDO);
      await expect(page.locator('#orvosBlokk')).toHaveClass(/hibas/);
      await expect(page.locator('#orvosTipp')).toBeHidden();           // a tipp és a hiba nem ismétli egymást
      await expect(page.locator('#orvosValaszto button[role=radio]').first()).toBeFocused();
      await expect(page.locator('#dlg')).toBeHidden();                  // az előnézet sem nyílik meg
      await expect(page.locator('#savKesz')).toBeHidden();
      expect(f.db).toBe(0);
      // orvost választva a hiba eltűnik, és a PDF elkészül
      await orvosValaszt(page, 'Dani');
      await expect(h).toBeHidden();
      await expect(page.locator('#orvosBlokk')).not.toHaveClass(/hibas/);
      const { nev } = await letoltes(page);
      expect(nev).toBe('Arlista_Dani_2026-10-10.pdf');
    });
  }

  test('több mint 4 orvosnál (legördülő lista) is: hiba, fókusz a listán, nincs PDF', async ({ page }) => {
    const a = adatok({ orvosok: ['Anna', 'Béla', 'Cecil', 'Dénes', 'Emese'], tetelek: [['Korona', [1, 2, 3, 4, 5]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { Korona: 1 } }), ido: IDO });
    const f = letoltesFigyelo(page);
    await expect(page.locator('#orvosSelect')).toHaveValue('');
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#orvosHiba')).toHaveText(/Válassz orvost a PDF elkészítéséhez\./);
    await expect(page.locator('#orvosSelect')).toBeFocused();
    expect(f.db).toBe(0);
    await orvosValaszt(page, 'Emese');
    await expect(page.locator('#orvosHiba')).toBeHidden();
    const { nev } = await letoltes(page);
    expect(nev).toBe('Arlista_Emese_2026-10-10.pdf');
  });

  test('nincs orvos ÉS nincs mennyiség: előbb az orvost kéri', async ({ page }) => {
    await nyit(page, { adat: adatok(), ido: IDO });
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#orvosHiba')).toHaveText(/Válassz orvost/);
    await expect(page.locator('#savUzenet')).toBeHidden();
  });
});

test.describe('minden mennyiség 0', () => {
  for (const [gombNev, gomb] of GOMBOK) {
    test(`${gombNev}: „Adj meg mennyiséget legalább egy tételnél a PDF elkészítéséhez.” a sávban, fókusz az első + gombon, nincs PDF`, async ({ page }) => {
      const a = adatok();
      await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti' }), ido: IDO });
      const f = letoltesFigyelo(page);
      await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
      await page.locator(gomb).click();
      const u = page.locator('#savUzenet');
      await expect(u).toBeVisible();
      expect(ny(await u.innerText())).toBe('Adj meg mennyiséget legalább egy tételnél a PDF elkészítéséhez.');
      expect(ny(await u.innerText())).toMatch(TEENDO);
      await expect(page.locator('#tetelLista .tetel .lep-plusz').first()).toBeFocused();
      await expect(page.locator('#dlg')).toBeHidden();
      await expect(page.locator('#savKesz')).toBeHidden();
      expect(f.db).toBe(0);
      // mennyiséget adva elkészül
      await mennyBeir(page, 'tetel2', 1);
      await expect(u).toBeHidden();
      const { nev } = await letoltes(page);
      expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
    });
  }

  test('beírt, majd 0-ra visszaállított mennyiség után is ugyanaz a hiba (nincs üres PDF)', async ({ page }) => {
    const a = adatok();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Anna', menny: { tetel3: 2 } }), ido: IDO });
    const f = letoltesFigyelo(page);
    await mennyBeir(page, 'tetel3', 0);
    await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#savUzenet')).toHaveText(/Adj meg mennyiséget legalább egy tételnél/);
    expect(f.db).toBe(0);
  });
});

test.describe('üres adatok', () => {
  test('nincs egy orvos sem: a választó és a sáv is az Árak lapra küld', async ({ page }) => {
    await nyit(page, { adat: adatok({ orvosok: [], tetelek: [['Korona', []]] }), ido: IDO });
    const f = letoltesFigyelo(page);
    await expect(page.locator('#orvosValaszto')).toContainText('Még nincs orvos. Vegyél fel orvost az Árak lapon.');
    await expect(page.locator('#orvosValaszto a[href="#arak"]')).toHaveText('Árak megnyitása');
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#savUzenet')).toHaveText(/Vegyél fel orvost az Árak lapon a PDF elkészítéséhez\./);
    expect(ny(await page.locator('#savUzenet').innerText())).toMatch(TEENDO);
    expect(f.db).toBe(0);
    await page.locator('#orvosValaszto a[href="#arak"]').click();
    await expect(page.locator('#nezetArak')).toBeVisible();
  });

  test('nincs egy tétel sem: a lista helyén és a sávban is az Árak lapra küld', async ({ page }) => {
    await nyit(page, { adat: adatok({ orvosok: ['Peti'], tetelek: [] }), ido: IDO });
    const f = letoltesFigyelo(page);
    await expect(page.locator('#nincsTetel')).toBeVisible();
    await expect(page.locator('#nincsTetel')).toContainText('Vegyél fel tételeket és árakat az Árak lapon, vagy töltsd be őket Excelből.');
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#savUzenet')).toHaveText(/Vegyél fel tételeket az Árak lapon a PDF elkészítéséhez\./);
    expect(f.db).toBe(0);
  });

  test('egyetlen orvos: magától ki van választva, a PDF orvosválasztás nélkül elkészül', async ({ page }) => {
    const a = adatok({ orvosok: ['Dr. Szűcs Ádám'], tetelek: [['Korona', [25000]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { Korona: 2 } }), ido: IDO });
    await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Dr. Szűcs Ádám');
    await expect(page.locator('#orvosTipp')).toBeHidden();
    await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 50 000 Ft');
    const { nev } = await letoltes(page);
    expect(nev).toBe('Arlista_Dr._Szűcs_Ádám_2026-10-10.pdf');
  });
});
