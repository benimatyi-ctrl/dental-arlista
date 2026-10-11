// 2. Funkcionális tesztek — mennyiségek: 0, 1, 9999 fölött, negatív, tizedes (2,5 és 2.5), szöveg, üres mező,
// beillesztett szöveg, a −/+ gombok a 0 (és a 9999) határán.
//
// A HELYES VISELKEDÉS (döntés, a fogtechnikai tételek egész darabok):
//  - Elfogadott: egész szám 0…9999; a szóköz a szélén, a „db” utótag és a teljes szélességű számjegy (１２) rendben.
//  - Üres mező = 0 (a mező elhagyásakor „0” látszik).
//  - 9999 fölött: 9999 lesz, és üzenet jelzi a felső határt.
//  - Negatív szám (−5, -5): NEM lesz belőle 5; a mennyiség nem változik, és üzenet jelzi, hogy csak 0 vagy pozitív egész lehet.
//  - Tizedes (2,5 vagy 2.5): az egész része marad (2), és üzenet jelzi, hogy csak egész szám adható meg
//    (billentyűvel gépelve sem lehet belőle 25: a vessző/pont eldobása után a következő számjegy hozzáragadt).
//  - Más szöveg (abc, 1e3, 0x10): NEM lesz belőle más szám (13, 10, 0); a mennyiség nem változik, és üzenet jelzi a hibát.
import { test, expect, nyit, adatok, mennyBeir, mennyMezo, tetelSor, osszegSzoveg, valasztas } from './segito.js';
import { ny, ftVart, taroltMennyNevvel, sorOsszeg } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const HIBA_MINTA = /szám|egész|negatív|érvénytelen/i;

async function megnyit(page, menny = {}) {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny }), ido: IDO });
  await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText('Peti');
  // minden megjelenő üzenet naplózása (az ideiglenes üzenet pár másodperc múlva eltűnik; terhelt gépen se maradjon le)
  await page.evaluate(() => {
    window.__uzenetek = [];
    const rogzit = () => {
      for (const e of document.querySelectorAll('#savUzenet, #uzenetek .uzenet, #tetelLista [role=alert], #tetelLista .mezo-hiba, #tetelLista .hiba')) {
        const t = e.textContent.replace(/\s+/g, ' ').trim();
        if (t && !e.hidden && !window.__uzenetek.includes(t)) window.__uzenetek.push(t);
      }
    };
    new MutationObserver(rogzit).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  });
}
// beírás háromféleképpen: kitöltés (egy input-esemény az egész szöveggel), beillesztés (insertFromPaste), gépelés (billentyűnként)
async function bevisz(page, mod, nev, szoveg) {
  const m = mennyMezo(page, nev);
  if (mod === 'kitöltés') { await m.fill(szoveg); return; }
  if (mod === 'beillesztés') {
    await m.focus();
    await m.evaluate((e, s) => {
      e.select();
      e.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: s }));
      e.value = s;
      e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: s }));
    }, szoveg);
    return;
  }
  await m.click();
  await m.selectText();
  await m.pressSequentially(szoveg, { delay: 20 });
}
// az üzenetek: a sáv üzenete, a felugró értesítések és a tétel sorában megjelenő hibaszöveg — a megnyitás óta minden
async function uzenetSzoveg(page) {
  return ny((await page.evaluate(() => window.__uzenetek || [])).join(' '));
}
// a bevitel utáni állapot: a tárolt mennyiség, az üzenet, és a mező tartalma az elhagyása után
async function allapot(page, nev) {
  const tarolt = (await taroltMennyNevvel(page))[nev] || 0;
  const uzenet = await uzenetSzoveg(page);
  await mennyMezo(page, nev).press('Enter');
  await expect(mennyMezo(page, nev)).not.toBeFocused();
  return { tarolt, uzenet, mezo: await mennyMezo(page, nev).inputValue() };
}

/* ------------------------------------------------------------ elfogadott értékek */
const ELFOGADOTT = [
  ['0', 0], ['1', 1], ['9999', 9999], ['', 0], ['3 db', 3], [' 12 ', 12], ['１２', 12]
];
for (const mod of ['kitöltés', 'beillesztés']) {
  for (const [be, vart] of ELFOGADOTT) {
    test(`elfogadott mennyiség (${mod}): „${be}” → ${vart} db, üzenet nélkül`, async ({ page }) => {
      await megnyit(page);
      await bevisz(page, mod, 'tetel1', be);
      const a = await allapot(page, 'tetel1');
      expect(a.tarolt).toBe(vart);
      expect(a.mezo).toBe(String(vart));
      expect(a.uzenet, 'érvényes bevitelnél ne legyen hibaüzenet').not.toMatch(HIBA_MINTA);
      if (vart > 0) expect(ny(await sorOsszeg(page, 'tetel1').innerText())).toBe(`${ftVart(vart).replace(' Ft', '')} db = ${ftVart(vart * 10000)}`);
      else await expect(sorOsszeg(page, 'tetel1')).toBeHidden();
    });
  }
}

test('üres mező: gépelés közben üres marad, a mennyiség 0, elhagyáskor „0” látszik (2 db-ról törölve is)', async ({ page }) => {
  await megnyit(page, { tetel1: 2 });
  const m = mennyMezo(page, 'tetel1');
  await m.click();
  await m.press('Backspace');                    // a fókuszáláskor kijelölt „2” törlése
  await expect(m).toHaveValue('');
  await expect.poll(async () => (await taroltMennyNevvel(page)).tetel1 || 0).toBe(0);
  await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
  await m.press('Enter');
  await expect(m).toHaveValue('0');
});

/* ------------------------------------------------------------ 9999 fölött */
for (const mod of ['kitöltés', 'beillesztés', 'gépelés']) {
  test(`9999 fölött (${mod}): „12345” → 9999 db, és üzenet jelzi a felső határt`, async ({ page }) => {
    await megnyit(page);
    await bevisz(page, mod, 'tetel1', '12345');
    const a = await allapot(page, 'tetel1');
    expect(a.tarolt).toBe(9999);
    expect(a.mezo).toBe('9999');
    expect(a.uzenet).toMatch(/legfeljebb 9 999 db/);
    expect(ny(await sorOsszeg(page, 'tetel1').innerText())).toBe('9 999 db = 99 990 000 Ft');
  });
}

/* ------------------------------------------------------------ negatív szám — FUN-01 */
for (const mod of ['kitöltés', 'beillesztés', 'gépelés']) {
  for (const be of ['-5', '−5']) {
    test(`[FUN-01] negatív mennyiség (${mod}): „${be}” nem lesz 5 db, a mennyiség nem változik, és üzenet jelzi`, async ({ page }) => {
      await megnyit(page);
      await bevisz(page, mod, 'tetel1', be);
      const a = await allapot(page, 'tetel1');
      expect(a.tarolt, `„${be}” beírása után a tárolt mennyiség`).toBe(0);
      expect(a.mezo).toBe('0');
      expect(a.uzenet, 'a felhasználó tudja meg, miért nem fogadta el').toMatch(HIBA_MINTA);
      await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
    });
  }
}

/* ------------------------------------------------------------ tizedes szám — FUN-02 */
for (const mod of ['kitöltés', 'beillesztés', 'gépelés']) {
  for (const be of ['2,5', '2.5']) {
    test(`[FUN-02] tizedes mennyiség (${mod}): „${be}” → 2 db (nem 25), és üzenet jelzi, hogy csak egész adható meg`, async ({ page }) => {
      await megnyit(page);
      await bevisz(page, mod, 'tetel1', be);
      const a = await allapot(page, 'tetel1');
      expect(a.tarolt).toBe(2);
      expect(a.mezo).toBe('2');
      expect(a.uzenet, 'a csendes levágás helyett szóljon').toMatch(/egész/i);
    });
  }
}

/* ------------------------------------------------------------ szöveg, exponens, hexa — FUN-03 */
for (const mod of ['kitöltés', 'beillesztés']) {
  for (const be of ['abc', '1e3', '0x10']) {
    test(`[FUN-03] szöveg a mennyiség helyén (${mod}): „${be}” nem lesz más szám, a mennyiség marad, és üzenet jelzi`, async ({ page }) => {
      await megnyit(page);
      await bevisz(page, mod, 'tetel1', be);
      const a = await allapot(page, 'tetel1');
      expect(a.tarolt, `„${be}” beírása után a tárolt mennyiség (nem 13 vagy 10)`).toBe(0);
      expect(a.mezo).toBe('0');
      expect(a.uzenet).toMatch(HIBA_MINTA);
    });
  }
}

test('[FUN-03] szöveg beillesztése egy meglévő mennyiség helyére: a 5 db megmarad, nem nullázódik csendben', async ({ page }) => {
  await megnyit(page, { tetel1: 5 });
  await bevisz(page, 'beillesztés', 'tetel1', 'abc');
  const a = await allapot(page, 'tetel1');
  expect(a.tarolt).toBe(5);
  expect(a.mezo).toBe('5');
  expect(a.uzenet).toMatch(HIBA_MINTA);
});

/* ------------------------------------------------------------ −/+ gombok */
test('a −/+ gombok a 0 határán: 0-nál a − tiltott, + → 1, − → 0, és nem megy 0 alá', async ({ page }) => {
  await megnyit(page);
  const sor = tetelSor(page, 'tetel2');
  const minusz = sor.locator('.lep-minusz'), plusz = sor.locator('.lep-plusz');
  await expect(minusz).toBeDisabled();
  await expect(plusz).toBeEnabled();
  await plusz.click();
  await expect(mennyMezo(page, 'tetel2')).toHaveValue('1');
  await expect(minusz).toBeEnabled();
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 8 000 Ft');
  await minusz.click();
  await expect(mennyMezo(page, 'tetel2')).toHaveValue('0');
  await expect(minusz).toBeDisabled();
  await minusz.click({ force: true });           // a tiltott gomb kattintása sem visz 0 alá
  await expect(mennyMezo(page, 'tetel2')).toHaveValue('0');
  expect((await taroltMennyNevvel(page)).tetel2).toBeUndefined();
  await expect(page.locator('#osszeg')).toHaveText('Még nincs kiválasztott tétel');
});

test('nyomva tartott − gomb: ismételve csökkent, és 0-nál megáll (nem lesz negatív)', async ({ page }) => {
  await megnyit(page, { tetel1: 4 });
  const minusz = tetelSor(page, 'tetel1').locator('.lep-minusz');
  const d = await minusz.boundingBox();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await taroltMennyNevvel(page)).tetel1 || 0, { timeout: 10_000 }).toBe(0);
  await expect(minusz).toBeDisabled();
  await page.waitForTimeout(400);                // tartva, a 0 alatt sem lép tovább
  await page.mouse.up();
  await expect(mennyMezo(page, 'tetel1')).toHaveValue('0');
  expect((await taroltMennyNevvel(page)).tetel1).toBeUndefined();
});

test('nyomva tartott + gomb: ismételve növel, és 9999-nél megáll; a − ott is működik', async ({ page }) => {
  await megnyit(page, { tetel1: 9995 });
  const sor = tetelSor(page, 'tetel1');
  const plusz = sor.locator('.lep-plusz');
  const d = await plusz.boundingBox();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await taroltMennyNevvel(page)).tetel1, { timeout: 10_000 }).toBe(9999);
  await expect(plusz).toBeDisabled();
  await page.mouse.up();
  await expect(mennyMezo(page, 'tetel1')).toHaveValue('9999');
  await sor.locator('.lep-minusz').click();
  await expect(mennyMezo(page, 'tetel1')).toHaveValue('9998');
  await expect(plusz).toBeEnabled();
});

test('Enter a mennyiségmezőben: elhagyja a mezőt, és az összeg frissül', async ({ page }) => {
  await megnyit(page);
  await mennyBeir(page, 'tetel3', 7);
  await expect(mennyMezo(page, 'tetel3')).not.toBeFocused();
  await expect.poll(async () => ny(await osszegSzoveg(page))).toBe('1 tétel, 63 000 Ft');
  expect(ny(await sorOsszeg(page, 'tetel3').innerText())).toBe('7 db = 63 000 Ft');
});
