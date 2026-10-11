// 4. Mobil és böngésző: képernyőképek a fő állapotokról (tests/kimenet/mobil/<projekt>/<állapot>.png), vízszintes görgetés,
// kilógás, levágott szöveg, az alsó sáv takarása, érintési célméret (≥ 48 px), billentyűzet (inputmode, a fókuszált mező
// nem kerül a sáv vagy a billentyűzet mögé), Web Share API (rejtett gomb, utánzott megosztás: siker, megszakítás, tiltás).
import { test, expect, nyit, adatok, valasztas, letoltes, osszegSzoveg, kepkockak } from './segito.js';
import {
  ALLAPOTOK, ALLAPOT_NEVEK, TOVABBI_ALLAPOTOK, IDO, MIN_CEL, kep, elrendezesMeres, savTakaras, dlgMeres, fokuszHelyzet,
  mobilProjekt, motor, kitoltottAdat, KITOLTOTT_MENNY, HOSSZU_ORVOSOK, HOSSZU_TETELEK, megosztasUtanzat, megosztasok, megosztasMod, FBAN_UA, varGorgetes
} from './segito-mobil.js';

const ny = s => String(s).replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ').trim();
const FAJLNEV = 'Arlista_Szentgyörgyi-Halmágyi_Eszter_2026-10-10.pdf';

/* ====================================================================== fő állapotok */
// az ismert hibák azonosítója az állapot szerint (a teszt címében): MOB-01 szűrőgomb, MOB-02 súgó-összefoglaló, MOB-04 bemondás gombjai
const CEL_HIBA = { kitoltott: 'MOB-01', tulcsordul: 'MOB-01', arak: 'MOB-02', sugoNyitva: 'MOB-02', hangEredmeny: 'MOB-04' };
const OSSZES = Object.assign({}, ALLAPOTOK, TOVABBI_ALLAPOTOK);
test.describe(`fő állapotok: képernyőkép, elrendezés és érintési célméret (≥ ${MIN_CEL} px)`, () => {
  for (const nev of Object.keys(OSSZES)) {
    const id = CEL_HIBA[nev];
    test(`${id ? `[${id}] ` : ''}${nev}: nincs vízszintes görgetés, kilógás, levágott szöveg; a sáv nem takar; minden gomb, mező, rádió és opció ≥ ${MIN_CEL}×${MIN_CEL} px`, async ({ page }, testInfo) => {
      const l = await OSSZES[nev](page);
      await kep(page, testInfo, nev);
      const m = await elrendezesMeres(page, { gyoker: l.dialogus ? '#dlg' : null });
      expect.soft(m.gorgetesX, 'vízszintes görgetés: a dokumentum szélesebb a nézetnél').toBe(0);
      expect.soft(m.bodyGorgetesX, 'vízszintes görgetés (body)').toBe(0);
      expect.soft(m.kilogo, 'a nézetből vízszintesen kilógó elemek').toEqual([]);
      expect.soft(m.levagott, 'levágott szöveg').toEqual([]);
      expect.soft(m.dlgGorgetesX, 'vízszintesen görgethető rész a párbeszédablakban').toEqual([]);
      expect.soft(m.kicsi, `${MIN_CEL} px-nél kisebb érintési cél`).toEqual([]);
      if (l.dialogus) {
        // a párbeszédablak teljesen a nézetben van, a tartalma végiggörgethető, és az utolsó sora a gombsor fölött látszik
        const d = await dlgMeres(page);
        await kep(page, testInfo, nev + '_alja');
        expect(d.teteje, 'a párbeszédablak teteje a nézetben').toBeGreaterThanOrEqual(-0.5);
        expect(d.alja, 'a párbeszédablak alja a nézetben').toBeLessThanOrEqual(d.vh + 0.5);
        expect(d.bal).toBeGreaterThanOrEqual(-0.5);
        expect(d.jobb).toBeLessThanOrEqual(d.vw + 0.5);
        if (d.tartalomAlja != null && d.labTeteje != null) expect(d.tartalomAlja, 'a tartalom utolsó sora a gombsor fölött').toBeLessThanOrEqual(d.labTeteje + 0.5);
      } else {
        // a lap aljára görgetve az utolsó tétel / vezérlő alja a sáv teteje fölött van
        const s = await savTakaras(page, l.nezet === 'arak' ? '#nezetArak' : '#nezetArlista');
        await kep(page, testInfo, nev + '_alja');
        expect(s.utolso, 'van látható tartalom').not.toBeNull();
        expect(s.utolso.alja, `az utolsó elem (${s.utolso.elem}) a sáv mögött marad`).toBeLessThanOrEqual(s.savTeteje + 0.5);
      }
    });
  }
});

test.describe('beépített (alkalmazáson belüli) böngésző: Messenger / Facebook', () => {
  test.use({ userAgent: FBAN_UA });
  test('[MOB-03] a figyelmeztetés „Link másolása” gombja legalább 48 px magas, a doboz nem lóg ki', async ({ page }, testInfo) => {
    await nyit(page, { adat: adatok(), ido: IDO });
    const f = page.locator('#beepitettFigy');
    await expect(f).toBeVisible();
    await kep(page, testInfo, 'beepitett_bongeszo');
    const m = await elrendezesMeres(page);
    expect.soft(m.gorgetesX).toBe(0);
    expect.soft(m.kilogo).toEqual([]);
    const g = await f.locator('button', { hasText: 'Link másolása' }).boundingBox();
    expect(g.height, '„Link másolása” magassága').toBeGreaterThanOrEqual(MIN_CEL - 0.5);
  });
});

/* ====================================================================== kereső legördülő */
test('[MOB-05] a kereső találatlistája nem csúszik az alsó sáv alá: a lista végére görgetve az utolsó találat látható és megkoppintható', async ({ page }, testInfo) => {
  await ALLAPOTOK.kereso(page);                    // „korona”: 5 találat, hosszú nevekkel
  const r = await page.evaluate(() => {
    const l = document.querySelector('#keresoLista');
    l.scrollTop = l.scrollHeight;
    const o = Array.from(l.querySelectorAll('.kereso-opcio'));
    const u = o[o.length - 1].getBoundingClientRect();
    const sav = document.querySelector('#sav').getBoundingClientRect();
    const kozep = document.elementFromPoint(u.left + u.width / 2, Math.min(u.top + u.height / 2, window.innerHeight - 1));
    return { db: o.length, utolsoTeteje: u.top, utolsoAlja: u.bottom, savTeteje: sav.top, vh: window.innerHeight, talalt: !!(kozep && kozep.closest('.kereso-opcio') === o[o.length - 1]) };
  });
  await kep(page, testInfo, 'kereso_lista_alja');
  expect(r.db).toBeGreaterThanOrEqual(4);
  expect(r.utolsoAlja, 'az utolsó találat alja a sáv teteje fölött').toBeLessThanOrEqual(Math.min(r.savTeteje, r.vh) + 0.5);
  expect(r.talalt, 'az utolsó találat közepére koppintva a találatot éri (nem a sávot)').toBe(true);
});

/* ====================================================================== hiányzó árak a sávban */
test('[MOB-E1] sok ár nélküli tétel (pl. új, még ár nélküli orvos kiválasztásakor): a sáv-üzenet nem takarja el a képernyőt — a sáv legfeljebb a nézet 45%-a, az orvosválasztó elérhető', async ({ page }, testInfo) => {
  // A „Nincs megadott ár (Dr. …): …” üzenet MINDEN ár nélküli tételnevet felsorol, korlát nélkül: 8 tételnél a sáv
  // 360×740-en már ~55%, 30 tételnél ~93% (a lista és az orvosválasztó gyakorlatilag elérhetetlen). A teljes lista a
  // „Hiányzó ár” ablakban úgyis megvan; a sávba elég az első néhány név és „…és még N tétel”.
  const n = 30;
  const tetelek = Array.from({ length: n }, (_, i) => { const [nev, p, cs] = HOSSZU_TETELEK[i % HOSSZU_TETELEK.length]; return [i < HOSSZU_TETELEK.length ? nev : `${nev} (${i + 1})`, [p[0], null], cs]; });
  const a = adatok({ orvosok: ['Kovács Éva', 'Új Orvos'], tetelek });
  const menny = Object.fromEntries(a.tetelek.map(t => [t.id, 1]));
  await nyit(page, { adat: a, valasztas: { orvosId: 'o2', menny, datum: null }, ido: IDO });
  await expect(page.locator('#savUzenet')).toContainText('Nincs megadott ár');
  await expect.poll(() => page.evaluate(() => document.querySelector('#sav').getBoundingClientRect().height)).toBeGreaterThan(0);
  const m = await page.evaluate(() => ({ sav: Math.round(document.querySelector('#sav').getBoundingClientRect().height), vh: window.innerHeight }));
  await kep(page, testInfo, 'sok_arhiany');
  expect(m.sav, `a sáv magassága ${m.sav} px a ${m.vh} px-es nézetből`).toBeLessThanOrEqual(Math.round(m.vh * 0.45));
  // az orvosválasztó a lap tetején elérhető és látható marad (át lehet váltani a régi orvosra)
  await page.evaluate(() => window.scrollTo(0, 0));
  const o = await page.locator('#orvosValaszto').boundingBox();
  const savTeteje = await page.evaluate(() => document.querySelector('#sav').getBoundingClientRect().top);
  expect(o.y + o.height, 'az orvosválasztó a sáv fölött látszik').toBeLessThanOrEqual(savTeteje + 0.5);
});

/* ====================================================================== billentyűzet */
test.describe('billentyűzet', () => {
  test('a mennyiségmezők numerikus billentyűzetet kérnek (inputmode=numeric, pattern=[0-9]*, enterkeyhint), és címkéjük van', async ({ page }) => {
    await ALLAPOTOK.kitoltott(page);
    const mezok = await page.locator('#tetelLista input.menny').evaluateAll(l => l.map(i => ({
      type: i.type, inputmode: i.getAttribute('inputmode'), pattern: i.getAttribute('pattern'), enter: i.getAttribute('enterkeyhint'),
      autocomplete: i.getAttribute('autocomplete'), cimke: i.getAttribute('aria-label')
    })));
    expect(mezok.length).toBe(14);
    for (const x of mezok) {
      expect(x.inputmode).toBe('numeric');
      expect(x.pattern).toBe('[0-9]*');
      expect(x.enter).toBe('done');
      expect(x.autocomplete).toBe('off');
      expect(x.cimke).toMatch(/^Mennyiség, .+/);
    }
    // az Árak táblázat ármezői tizedes billentyűzetet kérnek
    await page.locator('#nezetGomb').click();
    const ar = await page.locator('#arTabla input.ar-mezo').evaluateAll(l => [...new Set(l.map(i => i.getAttribute('inputmode')))]);
    expect(ar).toEqual(['decimal']);
  });

  test('a lista, az Árak és a párbeszédablakok szövegmezői legalább 16 px-es betűvel (iOS Safari nem nagyít bele fókuszáláskor)', async ({ page }) => {
    const kicsik = [];
    const gyujt = async hol => {
      const r = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=file]), select, textarea'))
        .filter(e => !e.closest('[hidden]') && !e.closest('.lathatatlan'))
        .map(e => ({ e: e.id || e.className || e.tagName, px: parseFloat(getComputedStyle(e).fontSize) })).filter(x => x.px < 16));
      kicsik.push(...r.map(x => `${hol}: ${x.e} (${x.px} px)`));
    };
    await TOVABBI_ALLAPOTOK.orvosLista(page); await gyujt('lista');
    await page.locator('#nezetGomb').click(); await gyujt('Árak');
    await page.locator('#ujOrvosGomb').click(); await gyujt('Új orvos'); await page.keyboard.press('Escape');
    await page.locator('#linkBetoltesGomb').click(); await gyujt('Betöltés linkből'); await page.keyboard.press('Escape');
    expect(kicsik).toEqual([]);
  });

  test('a „Küldés linkben” link-mezője nem okoz iOS-nagyítást: csak olvasható (nem hoz fel billentyűzetet), vagy legalább 16 px-es betűvel', async ({ page }) => {
    // Az iOS Safari a 16 px alatti SZERKESZTHETŐ mezőbe nagyít bele, amikor a billentyűzet feljön. A link-mező readonly
    // (csak kijelölni lehet), ezért a 14 px-es betű itt nem okoz nagyítást (az ellenőrzés szerint a MOB-06 nem hiba).
    await TOVABBI_ALLAPOTOK.linkKuldes(page);
    const m = await page.locator('#dlg textarea.link-mezo').evaluate(e => ({ px: parseFloat(getComputedStyle(e).fontSize), csakOlvas: e.readOnly }));
    expect(m.csakOlvas || m.px >= 16, `readonly: ${m.csakOlvas}, betűméret: ${m.px} px`).toBe(true);
  });

  test('[MOB-07] Tab-bal (iOS-en a billentyűzet „következő” nyilával) végigléptetve minden fókuszált mennyiségmező és ± gomb teljesen a sáv fölött látszik', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    await page.locator('#tetelLista .lep-plusz').first().focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    const takart = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      await kepkockak(page);                          // a fókusz utáni igazító görgetés egy képkockával később fut
      const h = await fokuszHelyzet(page);
      const bent = await page.evaluate(() => !!document.activeElement.closest('#tetelLista'));
      if (!h || !bent) break;
      if (h.teteje < -0.5 || h.alja > Math.min(h.savTeteje, h.lathatoAlja) + 0.5) {
        if (!takart.length) await kep(page, testInfo, 'tab_takart');
        takart.push(`${h.elem}: ${h.teteje}–${h.alja} (sáv: ${h.savTeteje})`);
      }
    }
    expect(takart, 'a sáv mögé vagy a nézeten kívülre került fókuszált elemek').toEqual([]);
  });

  test('[MOB-09] Shift+Tab-bal visszafelé léptetve a fókuszált mennyiségmező és ± gomb nem kerül a ragadós keresősor alá', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    await page.locator('#tetelLista .lep-plusz').last().focus();
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    const takart = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      await kepkockak(page);
      const r = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || !e.closest('#tetelLista')) return null;
        const k = document.querySelector('#keresoSor').getBoundingClientRect(), x = e.getBoundingClientRect();
        const ragad = k.top <= 0.5;                     // a keresősor a nézet tetejére tapadt
        return { elem: e.getAttribute('aria-label'), teteje: Math.round(x.top * 10) / 10, alja: Math.round(x.bottom * 10) / 10, keresoAlja: Math.round(k.bottom * 10) / 10, takar: x.top < -0.5 || (ragad && x.top < k.bottom - 0.5) };
      });
      if (!r) break;
      if (r.takar) {
        if (!takart.length) await kep(page, testInfo, 'shift_tab_takart');
        takart.push(`${r.elem}: ${r.teteje}–${r.alja} (a keresősor alja: ${r.keresoAlja})`);
      }
    }
    expect(takart, 'a ragadós keresősor alá vagy a nézet fölé került fókuszált elemek').toEqual([]);
  });

  test('feljövő billentyűzet (kisebb látható terület): a böngésző a fókuszált mezőt a sáv fölé görgeti (scroll-padding-bottom)', async ({ page }, testInfo) => {
    // A Playwright nem tud valódi virtuális billentyűzetet. A látható terület csökkenésekor a böngészők maguk görgetik
    // láthatóvá a fókuszált szerkeszthető mezőt (iOS Safari, Chrome; a „resizes-content” módban is) — ezt a lépést a
    // scrollIntoView({ block: 'nearest' }) utánozza. Az alkalmazás dolga, hogy ilyenkor a mező a sáv FÖLÉ kerüljön
    // (html scroll-padding-bottom = a sáv magassága); az ellenőrzés szerint ez teljesül (a MOB-08 nem hiba: az átméretezés
    // utáni azonnali állapot a böngésző saját görgetése nélkül nem valószerű).
    await ALLAPOTOK.kitoltott(page);
    const id = await page.evaluate(() => {
      const savTop = document.querySelector('#sav').getBoundingClientRect().top;
      const l = Array.from(document.querySelectorAll('input.menny:not(:disabled)')).filter(i => { const r = i.getBoundingClientRect(); return r.bottom <= savTop && r.top >= 0; });
      return l[l.length - 1].closest('li').dataset.id;
    });
    const mezo = page.locator(`li[data-id="${id}"] input.menny`);
    if (mobilProjekt(testInfo)) await mezo.tap(); else await mezo.click();
    await expect(mezo).toBeFocused();
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.6) });
    await expect.poll(async () => {
      await page.evaluate(() => document.activeElement && document.activeElement.scrollIntoView({ block: 'nearest' }));
      const h = await fokuszHelyzet(page);
      return !!h && h.teteje >= -0.5 && h.alja <= Math.min(h.savTeteje, h.lathatoAlja) + 0.5;
    }, { message: 'a fókuszált mező a böngésző görgetése után is a sáv vagy a billentyűzet mögött maradt', timeout: 5000 }).toBe(true);
    await kep(page, testInfo, 'billentyuzet');
  });

  test('[MOB-12] a mennyiségmezőbe koppintva / kattintva a régi érték kijelölődik: a beírt szám felülírja (3 → 7, nem 37), Enterre a billentyűzet bezárul', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    const mezo = page.locator('#tetelLista input.menny').first();
    await expect(mezo).toHaveValue('3');
    if (mobilProjekt(testInfo)) await mezo.tap(); else await mezo.click();
    await expect(mezo).toBeFocused();
    await page.keyboard.type('7');
    await expect(mezo).toHaveValue('7');
    await page.keyboard.press('Enter');
    await expect(mezo).not.toBeFocused();
    await expect(page.locator('#tetelLista .tetel-sor-ossz').first()).toHaveText(/^7\s*db = 364\s*000\s*Ft$/);
  });
});

/* ====================================================================== Web Share API */
test.describe('Web Share API nélkül (a tesztböngészők alapállapota)', () => {
  test('a Megosztás gomb rejtve van, és a kész panelen sincs; minden látható sáv-gomb működik és van neve', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    expect(await page.evaluate(() => !!(navigator.canShare && navigator.share))).toBe(false);
    await expect(page.locator('#megosztGomb')).toBeHidden();
    await expect(page.locator('#letoltGomb')).toHaveClass(/gomb-fo/);
    await expect(page.locator('#letoltGomb')).toHaveAccessibleName('PDF letöltése');
    await expect(page.locator('#gmailGomb')).toHaveAccessibleName('Gmail');
    await expect(page.locator('#elonezetGomb')).toHaveAccessibleName('Előnézet');
    const { nev } = await letoltes(page);
    expect(nev).toBe(FAJLNEV);
    await expect(page.locator('#savKesz')).toBeVisible();
    await kep(page, testInfo, 'kesz_megosztas_nelkul');
    await expect(page.locator('#keszMegosztGomb')).toBeHidden();
    await expect(page.locator('#keszLetoltGomb')).toHaveClass(/gomb-fo/);
    for (const g of await page.locator('#savKesz button:visible').all()) {
      expect(ny(await g.innerText()) || await g.getAttribute('aria-label'), 'a gombnak van felirata').toBeTruthy();
      await expect(g).toBeEnabled();
    }
    // „Letöltés újra” valóban újra letölti ugyanazt a fájlt
    const ujra = await letoltes(page, '#keszLetoltGomb');
    expect(ujra.nev).toBe(FAJLNEV);
  });

  test('a „Küldés linkben” ablakban megosztás nélkül nincs Megosztás gomb, a Másolás az elsődleges', async ({ page }) => {
    await TOVABBI_ALLAPOTOK.linkKuldes(page);
    const gombok = page.locator('#dlg .dlg-lab button');
    await expect(gombok).toHaveText(['Bezárás', 'Másolás']);
    await expect(gombok.nth(1)).toHaveClass(/gomb-fo/);
  });

  test('Gmail-gomb megosztás nélkül: letölti a PDF-et, megnyitja a Gmail új levelét kitöltött tárggyal, és elmondja, mit tegyen', async ({ page, context }) => {
    await ALLAPOTOK.kitoltott(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), context.waitForEvent('page'), page.locator('#gmailGomb').click()]);
    expect(dl.suggestedFilename()).toBe(FAJLNEV);
    await expect.poll(() => context.kulsoKeresek.find(u => u.startsWith('https://mail.google.com/'))).toBeTruthy();
    const url = new URL(context.kulsoKeresek.find(u => u.startsWith('https://mail.google.com/')));
    expect(url.searchParams.get('view')).toBe('cm');
    expect(url.searchParams.get('su')).toBe('Árlista – dentÁl – 2026.10.10.');
    expect(url.searchParams.get('body')).toContain('Tisztelt Dr. Szentgyörgyi-Halmágyi Eszter!');
    await expect(page.locator('#keszCim')).toHaveText('Letöltve, a Gmail megnyílt · sorszám: 20261010-01');
    await expect(page.locator('#uzenetek')).toContainText('Csatold a PDF-et');
  });
});

test.describe('Web Share API-val (utánzott navigator.share / canShare)', () => {
  test.beforeEach(async ({ page }) => { await megosztasUtanzat(page); });

  test('a Megosztás gomb megjelenik; iOS-en (WebKit mobil) ez az elsődleges, máshol a PDF letöltése; a kis ikongomb ≥ 48 px és van neve', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    const ios = motor(testInfo) === 'webkit' && mobilProjekt(testInfo);
    await expect(page.locator('#megosztGomb')).toBeVisible();
    const elso = page.locator('#savGombok > button').first();
    await expect(elso).toHaveId(ios ? 'megosztGomb' : 'letoltGomb');
    await expect(elso).toHaveClass(/gomb-fo/);
    await expect(elso).toHaveAccessibleName(ios ? 'Megosztás' : 'PDF letöltése');
    const ikonGomb = page.locator(ios ? '#letoltGomb' : '#megosztGomb');
    await expect(ikonGomb).toHaveClass(/csak-ikon/);
    await expect(ikonGomb).toHaveAccessibleName(ios ? 'PDF letöltése' : 'Megosztás');
    await kep(page, testInfo, 'megosztas_sav');
    const m = await elrendezesMeres(page);
    expect(m.kilogo).toEqual([]);
    expect(m.kicsi.filter(x => /#(megoszt|letolt|gmail|elonezet)Gomb/.test(x.elem))).toEqual([]);
    // a sáv gombjainak felirata egy sorban marad (nem tördelődik két sorba)
    const magas = await page.locator('#savGombok > button:visible').evaluateAll(l => l.map(b => Math.round(b.getBoundingClientRect().height)));
    for (const h of magas) expect(h).toBeLessThanOrEqual(53);
  });

  test('siker: Arlista_….pdf fájlt ad át application/pdf típussal, utána „Megosztva” kész panel, a mennyiségek nullázva', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    await page.locator('#megosztGomb').click();
    await expect(page.locator('#savKesz')).toBeVisible();
    const m = await megosztasok(page);
    expect(m).toHaveLength(1);
    expect(m[0].fajlok).toHaveLength(1);
    expect(m[0].fajlok[0].nev).toBe(FAJLNEV);
    expect(m[0].fajlok[0].tipus).toBe('application/pdf');
    expect(m[0].fajlok[0].meret).toBeGreaterThan(5000);
    expect(m[0].title).toBe(FAJLNEV);
    await expect(page.locator('#keszCim')).toHaveText('Megosztva · sorszám: 20261010-01');
    await expect(page.locator('#keszMegosztGomb')).toBeVisible();
    await kep(page, testInfo, 'kesz_megosztva');
    expect(ny(await osszegSzoveg(page))).toBe('Még nincs kiválasztott tétel');
    // a kész panel „Megosztás” gombja ugyanazt a PDF-et osztja meg újra
    await page.locator('#keszMegosztGomb').click();
    await expect.poll(async () => (await megosztasok(page)).length).toBe(2);
    expect((await megosztasok(page))[1].fajlok[0].nev).toBe(FAJLNEV);
  });

  test('megszakítás (AbortError): a mennyiségek megmaradnak, üzenet jelenik meg, nincs kész panel, a sorszám nem fogy el', async ({ page }) => {
    await ALLAPOTOK.kitoltott(page);
    await megosztasMod(page, 'AbortError');
    await page.locator('#megosztGomb').click();
    await expect(page.locator('#uzenetek')).toContainText('A megosztás megszakadt; a mennyiségek megmaradtak.');
    await expect(page.locator('#savKesz')).toBeHidden();
    expect(ny(await osszegSzoveg(page))).toBe('5 tétel, 1 005 500 Ft');
    expect(await page.evaluate(() => window.dentAl.sorszamKovetkezo('20261010'))).toBe(1);
    // újra megosztva már sikerül, ugyanazzal a sorszámmal
    await megosztasMod(page, 'siker');
    await page.locator('#megosztGomb').click();
    await expect(page.locator('#keszCim')).toHaveText('Megosztva · sorszám: 20261010-01');
  });

  test('[MOB-10] tiltás (NotAllowedError, pl. lejárt felhasználói aktiválás): tartalék panel „Koppints a Megosztás gombra”, és a gomb tényleg újra megoszt (nem dob hibát)', async ({ page }, testInfo) => {
    await ALLAPOTOK.kitoltott(page);
    await megosztasMod(page, 'NotAllowedError');
    await page.locator('#megosztGomb').click();
    await expect(page.locator('#savKesz')).toBeVisible();
    await expect(page.locator('#keszCim')).toHaveText('A PDF elkészült. Koppints a Megosztás gombra.');
    await expect(page.locator('#keszMegosztGomb')).toBeFocused();
    await expect(page.locator('#keszMegnyitGomb')).toBeHidden();
    await expect(page.locator('#keszUjGomb')).toHaveText('Mégse');
    expect(ny(await osszegSzoveg(page))).toBe('5 tétel, 1 005 500 Ft');   // a mennyiségek még megvannak
    await kep(page, testInfo, 'megosztas_tartalek');
    await megosztasMod(page, 'siker');
    await page.locator('#keszMegosztGomb').click();
    await expect(page.locator('#keszCim')).toHaveText('Megosztva · sorszám: 20261010-01');
    expect(await megosztasok(page)).toHaveLength(2);
  });

  test('[MOB-11] Gmail-megosztás tiltásakor (NotAllowedError) a fókusz a Gmail gombra kerül, mert a szöveg azt kéri, és a gomb a levél szövegével oszt meg', async ({ page }) => {
    await ALLAPOTOK.kitoltott(page);
    await megosztasMod(page, 'NotAllowedError');
    await page.locator('#gmailGomb').click();
    await expect(page.locator('#keszCim')).toHaveText('A PDF elkészült. Koppints a Gmail gombra.');
    await megosztasMod(page, 'siker');
    await expect(page.locator('#keszGmailGomb')).toBeFocused();
    await page.locator('#keszGmailGomb').click();
    await expect(page.locator('#keszCim')).toHaveText('Megosztva · sorszám: 20261010-01');
    const m = await megosztasok(page);
    expect(m[m.length - 1].title).toBe('Árlista – dentÁl – 2026.10.10.');
  });

  test('Gmail megosztással: a fájl mellett a levél tárgya és szövege is átmegy a megosztásnak', async ({ page }) => {
    await ALLAPOTOK.kitoltott(page);
    await page.locator('#gmailGomb').click();
    await expect(page.locator('#savKesz')).toBeVisible();
    const m = await megosztasok(page);
    expect(m).toHaveLength(1);
    expect(m[0].title).toBe('Árlista – dentÁl – 2026.10.10.');
    expect(m[0].text).toContain('Tisztelt Dr. Szentgyörgyi-Halmágyi Eszter!');
    expect(m[0].fajlok[0].nev).toBe(FAJLNEV);
  });

  test('Előnézet: a párbeszédablakban is van Megosztás (iOS-en elöl), és az is a PDF-et osztja meg', async ({ page }, testInfo) => {
    await ALLAPOTOK.pdfElonezet(page);
    const ios = motor(testInfo) === 'webkit' && mobilProjekt(testInfo);
    const gombok = page.locator('#dlg .dlg-lab button');
    await expect(gombok).toHaveText(ios ? ['Megosztás', 'PDF letöltése'] : ['PDF letöltése', 'Megosztás']);
    await kep(page, testInfo, 'elonezet_megosztassal');
    await page.locator('#dlg .dlg-lab button', { hasText: 'Megosztás' }).click();
    await expect(page.locator('#keszCim')).toHaveText('Megosztva · sorszám: 20261010-01');
    expect((await megosztasok(page))[0].fajlok[0].tipus).toBe('application/pdf');
  });

  test('ha a böngésző fájlt nem tud megosztani (canShare a fájlra false): a Megosztás gomb rejtve marad', async ({ page }) => {
    await page.addInitScript(() => { window.__megosztasMod = 'nincsFajl'; });
    await ALLAPOTOK.kitoltott(page);
    await expect(page.locator('#megosztGomb')).toBeHidden();
    await expect(page.locator('#letoltGomb')).toHaveClass(/gomb-fo/);
  });

  test('„Küldés linkben”: Megosztás gomb a linkkel (url), siker után az ablak bezárul', async ({ page }) => {
    await TOVABBI_ALLAPOTOK.linkKuldes(page);
    const gombok = page.locator('#dlg .dlg-lab button');
    await expect(gombok).toHaveText(['Bezárás', 'Másolás', 'Megosztás']);
    const link = await page.locator('#dlg textarea.link-mezo').inputValue();
    await gombok.nth(2).click();
    await expect(page.locator('#dlg')).toBeHidden();
    const m = await megosztasok(page);
    expect(m).toHaveLength(1);
    expect(m[0].url).toBe(link);
    expect(m[0].fajlok).toEqual([]);
  });
});
