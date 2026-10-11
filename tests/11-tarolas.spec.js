// Tárolás: localStorage (letiltva, betelt, sérült/hibás típusú adatok), IndexedDB nélkül, mentés és visszatöltés.
// A hibát feltáró tesztek a HELYES viselkedést várják (most pirosak); a címükben a hiba azonosítója áll.
import fs from 'node:fs';
import { test, expect, nyit, kesz, adatok, valasztas, orvosValaszt, mennyBeir, tetelSor, letoltes, pdfKozvetlen, KULCS, MINTA, uzenetNaploIndit, uzenetNaplo } from './segito.js';
import { olvasFajl, SZKRIPT_UT, jsonBuffer, arakNezet, listaNezet } from './segito-biztonsag.js';

const IDO = '2026-10-10T09:00:00';
const MINTA_ORVOSOK = MINTA.orvosok;
const hibaUzenetek = page => page.locator('#uzenetek .uzenet.hiba');
// Az összes valaha megjelent hiba-értesítés (a 12 mp után eltűnőket is) — a „csak egyszer szól” ellenőrzéséhez.
async function hibaToastSzamlalo(page) {
  await page.addInitScript(() => {
    window.__hibaToastok = [];
    // a dokumentum elejétől figyel: az induláskor (a szkript futása közben) megjelenő értesítést is elkapja
    new MutationObserver(m => {
      for (const r of m) for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList.contains('uzenet') && n.classList.contains('hiba')) window.__hibaToastok.push(n.textContent);
    }).observe(document, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => window.__hibaToastok);
}

// új lap ugyanabban a környezetben, előre beírt (akár hibás) nyers tároló-értékekkel; a lap hibáit gyűjti
async function lapNyers(context, ertekek, { ido = IDO, hash = '' } = {}) {
  const p = await context.newPage();
  const hibak = [];
  p.on('pageerror', e => hibak.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') hibak.push('console: ' + m.text()); });
  await p.clock.setFixedTime(new Date(ido));
  await p.addInitScript(ertekek => {
    if (sessionStorage.getItem('__nyers_mag')) return;
    localStorage.clear();
    for (const [k, v] of Object.entries(ertekek)) localStorage.setItem(k, v);
    sessionStorage.setItem('__nyers_mag', '1');
  }, ertekek);
  await p.goto('/index.html' + hash);
  await kesz(p);
  return { p, hibak };
}

/* ======================================================================
   Statikus ellenőrzés
   ====================================================================== */
test('a localStorage minden olvasása és írása try/catch-ben van (nyersOlvas / ir / torolKulcs), máshol nincs közvetlen hozzáférés', () => {
  const src = olvasFajl(SZKRIPT_UT);
  const sorok = src.split('\n');
  const hozzaferes = sorok.map((s, i) => ({ s, i: i + 1 })).filter(x => /\b(localStorage|sessionStorage)\s*[.[]/.test(x.s));
  expect(hozzaferes.map(x => x.i + ': ' + x.s.trim().slice(0, 60)).length).toBe(3);
  for (const { s, i } of hozzaferes) expect(s, `szkript.js:${i}`).toMatch(/try \{ (return )?localStorage\.(getItem|setItem|removeItem)\(/);
  expect(src).toMatch(/function nyersOlvas\(k\) \{ try \{ return localStorage\.getItem\(k\); \} catch \(e\) \{ return null; \} \}/);
  // az IndexedDB megnyitása is try/catch-ben (és ígéret-elutasítással) történik
  expect(src).toMatch(/try \{\s*const r = verzio \? indexedDB\.open/);
});

/* ======================================================================
   Letiltott tároló (privát mód, letiltott webhelyadatok)
   ====================================================================== */
test.describe('letiltott tároló', () => {
  test('indul a mintaadatokkal, egyszer figyelmeztet, a PDF letölthető, a sorszám a munkameneten belül nő', async ({ page }) => {
    const toastok = await hibaToastSzamlalo(page);
    await nyit(page, { tarolasTiltva: true, ido: IDO });
    await expect(hibaUzenetek(page)).toHaveCount(1);
    await expect(hibaUzenetek(page)).toContainText('nem engedi az adatok mentését');
    await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(MINTA_ORVOSOK);
    await expect(page.locator('#tetelLista .tetel-nev')).toHaveText(['tetel1', 'tetel2', 'tetel3', 'tetel4']);
    await orvosValaszt(page, 'Anna');
    await mennyBeir(page, 'tetel2', 3);
    await expect(tetelSor(page, 'tetel2').locator('.tetel-sor-ossz')).toContainText(/15\s000\sFt/);
    const d1 = await letoltes(page);
    expect(d1.nev).toBe('Arlista_Anna_2026-10-10.pdf');
    expect(d1.bajtok.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await expect(page.locator('#keszCim')).toContainText('20261010-01');
    await page.locator('#keszVisszaGomb').click();
    await letoltes(page);
    await expect(page.locator('#keszCim')).toContainText('20261010-02');
    const t = await toastok();
    expect(t.length, 'a figyelmeztetés nem ismétlődik').toBe(1);
    expect(t[0]).toContain('nem engedi az adatok mentését');
  });

  test('az Árak lapon a változás „Nem sikerült menteni” jelzést ad (nem „Mentve”), a mentés fájlba működik', async ({ page }) => {
    await nyit(page, { tarolasTiltva: true, ido: IDO, hash: '#arak' });
    const mezo = page.locator('.ar-mezo').first();
    await mezo.fill('12345');
    await mezo.press('Tab');
    await expect(page.locator('#mentveJelzo')).toHaveText('Nem sikerült menteni ezen az eszközön.');
    await page.locator('#beallMono').check();
    await expect(page.locator('#mentveJelzo')).toHaveText('Nem sikerült menteni ezen az eszközön.');
    // a memóriában a változás megvan: az árlistán is látszik
    await listaNezet(page);
    await orvosValaszt(page, 'Peti');
    await expect(tetelSor(page, 'tetel1').locator('.tetel-ar')).toContainText(/12\s345\sFt/);
    // biztonsági mentés fájlba tároló nélkül is
    await arakNezet(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#jsonMentesGomb').click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    expect(j.alkalmazas).toBe('dentAl-arlista');
    expect(j.tetelek[0].arak.Peti).toBe(12345);
  });
});

/* ======================================================================
   Betelt tárhely (QuotaExceededError)
   ====================================================================== */
// a setItem a megadott kulcsokra (minta) QuotaExceededError-t dob, a tesztkeret saját magolása után
async function kvotaTullepes(page, minta = '^dentAl\\.') {
  await page.addInitScript(minta => {
    const re = new RegExp(minta);
    const eredeti = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (this === window.localStorage && re.test(String(k)) && sessionStorage.getItem('__teszt_mag')) throw new DOMException('A tárhely betelt (teszt)', 'QuotaExceededError');
      return eredeti.call(this, k, v);
    };
  }, minta);
}

test.describe('betelt tárhely', () => {
  test('egyszer figyelmeztet, az alkalmazás működik, a PDF letölthető, a sorszám nő', async ({ page }) => {
    const toastok = await hibaToastSzamlalo(page);
    await kvotaTullepes(page);
    const a = adatok();
    await nyit(page, { adat: a, ido: IDO });
    await expect(hibaUzenetek(page)).toHaveCount(1);
    await expect(hibaUzenetek(page)).toContainText('Betelt a böngésző tárhelye');
    await orvosValaszt(page, 'Dani');
    await mennyBeir(page, 'tetel2', 3);
    const d1 = await letoltes(page);
    expect(d1.nev).toBe('Arlista_Dani_2026-10-10.pdf');
    await expect(page.locator('#keszCim')).toContainText('20261010-01');
    await page.locator('#keszVisszaGomb').click();
    await expect(tetelSor(page, 'tetel2').locator('input.menny')).toHaveValue('3');
    await letoltes(page);
    await expect(page.locator('#keszCim')).toContainText('20261010-02');
    const t = await toastok();
    expect(t.length, 'a figyelmeztetés nem ismétlődik').toBe(1);
    expect(t[0]).toContain('Betelt a böngésző tárhelye');
  });

  test('ha csak az árak mentése nem fér el: induláskor nincs figyelmeztetés, az ár módosításakor van („Nem sikerült menteni”)', async ({ page }) => {
    await kvotaTullepes(page, '^dentAl\\.adatok\\.v1$');
    await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' });
    await expect(page.locator('#arTabla .ar-mezo').first()).toBeVisible();
    await expect(hibaUzenetek(page)).toHaveCount(0);
    const mezo = page.locator('.ar-mezo').first();
    await mezo.fill('11111');
    await mezo.press('Tab');
    await expect(page.locator('#mentveJelzo')).toHaveText('Nem sikerült menteni ezen az eszközön.');
    await expect(hibaUzenetek(page)).toHaveCount(1);
    await expect(hibaUzenetek(page)).toContainText('Betelt a böngésző tárhelye');
  });
});

/* ======================================================================
   IndexedDB nélkül
   ====================================================================== */
test('IndexedDB nélkül (pl. privát mód): a PDF elkészül, az Árak lapon érthető figyelmeztetés', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException('Az IndexedDB nem érhető el (teszt)', 'InvalidStateError'); };
  });
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 2 } }), ido: IDO });
  const { nev, bajtok } = await letoltes(page);
  expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
  expect(bajtok.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await arakNezet(page);
  await expect(page.locator('#offlineAllapot')).toContainText('nem engedi a fájlok tárolását');
});

/* ======================================================================
   Sérült adatok és hibás típusok
   ====================================================================== */
test.describe('sérült adatok', () => {
  // Teljesen használhatatlan tartalom (nem JSON, rossz típus, az orvosok nem tömb): a mintaadatok töltődnek be.
  // (A rekordszintű hibák — üres név, nem szöveg vagy ismétlődő azonosító — a [TAR-03] tesztjeiben vannak: ott a többi,
  // érvényes rekordnak meg kell maradnia, ezért itt nem várjuk a mintaadatokat.)
  const ROSSZ_ADATOK = [
    ['{bad json', 'nem JSON'], ['[]', 'tömb'], ['42', 'szám'], ['null', 'null'], ['"szöveg"', 'szöveg'],
    ['{"orvosok":"x","tetelek":[]}', 'orvosok nem tömb']
  ];
  test('dentAl.adatok.v1: indul a mintaadatokkal, egyszer szól, a sérült másolat megmarad, újratöltéskor nem ismétlődik', async ({ context }) => {
    test.setTimeout(240_000);                          // több változat, mindegyik külön lapon
    for (const [ertek, leiras] of ROSSZ_ADATOK) {
      const { p, hibak } = await lapNyers(context, { [KULCS.adatok]: ertek });
      await expect(p.locator('#orvosValaszto button[role=radio]'), leiras).toHaveText(MINTA_ORVOSOK);
      await expect(hibaUzenetek(p), leiras).toHaveCount(1);
      await expect(hibaUzenetek(p), leiras).toContainText('A tárolt árak sérültek voltak');
      const masolat = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dentAl.serult.')).map(k => localStorage.getItem(k)));
      expect(masolat, `${leiras}: a sérült másolat`).toEqual([JSON.stringify(ertek)]);
      const most = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KULCS.adatok);
      expect(most.orvosok.map(o => o.nev), leiras).toEqual(MINTA_ORVOSOK);
      await p.reload(); await kesz(p);
      await expect(p.locator('#orvosValaszto button[role=radio]')).toHaveText(MINTA_ORVOSOK);
      await p.waitForTimeout(300);
      await expect(hibaUzenetek(p), `${leiras}: újratöltés után nincs újabb figyelmeztetés`).toHaveCount(0);
      expect(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dentAl.serult.')).length), leiras).toBe(1);
      expect(hibak, leiras).toEqual([]);
      await p.close();
    }
  });

  test('dentAl.adatok.v1 sérült: a PDF a mintaadatokkal elkészül', async ({ context }) => {
    const { p, hibak } = await lapNyers(context, { [KULCS.adatok]: '{bad json' });
    await orvosValaszt(p, 'Peti');
    await mennyBeir(p, 'tetel1', 1);
    const k = await pdfKozvetlen(p);
    expect(k && k.oldalak).toBe(1);
    expect(k.fajlnev).toBe('Arlista_Peti_2026-10-10.pdf');
    expect(hibak).toEqual([]);
  });

  const MASIK_KULCSOK = [
    [KULCS.valasztas, ['{bad', '[]', '"x"', '{"orvosId":5,"menny":{"t1":"3","t2":-1,"t3":2.5,"t4":99999,"nincs":2},"datum":"x"}', '{"orvosId":"o1","menny":[1,2],"datum":20261010}']],
    [KULCS.sorszam, ['{bad', '[]', '{"napok":"x"}', '{"napok":{"20261010":"7"}}', '{"napok":{"20261010":-3}}', '{"datum":"20261010","utolso":"x"}']],
    [KULCS.beall, ['{bad', '"x"', '[]', '{"nullazas":"igen","szinesLogo":1}']],
    [KULCS.github, ['{bad', '"x"', '[]', '{"tarolo":5}']],
    ['dentAl.hangAliasok.v1', ['{bad', '[]', '{"tetel1":"x"}', '{"tetel1":[1,null,"",{"a":1}]}']],
    [KULCS.elozo, ['{bad', '{"adat":"x"}', '[]']]
  ];
  for (const [kulcs, ertekek] of MASIK_KULCSOK) {
    test(`${kulcs}: hibás tartalommal is indul, nincs JS-hiba, az árlista és a PDF működik`, async ({ context }) => {
      test.setTimeout(300_000);                        // több változat, mindegyik külön lapon (PDF-fel)
      for (const ertek of ertekek) {
        const { p, hibak } = await lapNyers(context, { [kulcs]: ertek });
        const cimke = `${kulcs} = ${ertek}`;
        await expect(p.locator('#orvosValaszto button[role=radio]'), cimke).toHaveText(MINTA_ORVOSOK);
        await expect(p.locator('#osszeg'), cimke).toHaveText('Még nincs kiválasztott tétel');
        await orvosValaszt(p, 'Dani');
        await mennyBeir(p, 'tetel4', 2);
        const k = await pdfKozvetlen(p);
        expect(k && k.oldalak, cimke).toBe(1);
        expect(k.sorszam, cimke).toBe('20261010-01');
        // az Árak lap is megnyílik (beállítások, GitHub-űrlap, visszaállítás gomb)
        await arakNezet(p);
        await expect(p.locator('#beallNullazas'), cimke).toBeChecked();
        await expect(p.locator('#ghTarolo'), cimke).toBeVisible();
        await expect(p.locator('#importVisszaGomb'), cimke).toBeHidden();
        await p.locator('#arTabla .sor-gomb').first().click();
        await expect(p.locator('#aliasMezo'), cimke).toBeVisible();
        await p.locator('#dlg button', { hasText: 'Mégse' }).click();
        await p.locator('#beallNullazas').uncheck();
        await expect.poll(() => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KULCS.beall), cimke).toMatchObject({ nullazas: false });
        expect(hibak, cimke).toEqual([]);
        await p.close();
      }
    });
  }

  test('a régi sorszám-formátum ({datum, utolso}) tovább számol', async ({ context }) => {
    const { p } = await lapNyers(context, { [KULCS.sorszam]: '{"datum":"20261010","utolso":4}' });
    await orvosValaszt(p, 'Peti');
    await mennyBeir(p, 'tetel1', 1);
    expect((await pdfKozvetlen(p)).sorszam).toBe('20261010-05');
  });

  test('[TAR-02] érvénytelen tárolt dátum (2026-02-30, 2026-13-45): a mai dátumot nem jelzi „nem mai”-nak', async ({ context }) => {
    test.setTimeout(150_000);
    for (const datum of ['2026-02-30', '2026-13-45']) {
      const { p } = await lapNyers(context, { [KULCS.valasztas]: JSON.stringify({ orvosId: 'o1', menny: { t1: 1 }, datum }) });
      await expect(p.locator('#datumMezo')).toHaveValue('2026-10-10');
      await expect(p.locator('#datumSzoveg'), datum).toContainText('(ma)');
      await expect(p.locator('#datumTipp'), `${datum}: „Nem a mai dátum” figyelmeztetés`).toBeHidden();
      await expect(p.locator('#maGomb'), `${datum}: „Ma” gomb`).toBeHidden();
      await p.close();
    }
  });

  // [TAR-03] Egyetlen hibás orvos- vagy tételrekord (üres név, nem szöveg vagy ismétlődő azonosító) miatt ma az összes
  // orvos, tétel és ár a mintaadatokra cserélődik. Helyes: az érvényes rekordok és áraik megmaradnak, a hibás kimarad;
  // a felhasználó egyszer értesítést kap, és az eredeti (sérült) tartalom külön másolatban megmarad.
  const HIBAS_REKORDOK = [
    ['üres nevű orvos', { id: 'o2', nev: '' }],
    ['ismétlődő azonosítójú orvos', { id: 'o1', nev: 'Dupla Dénes' }],
    ['nem szöveg azonosítójú orvos', { id: 2, nev: 'Szám Zoltán' }]
  ];
  for (const [leiras, hibas] of HIBAS_REKORDOK) {
    test(`[TAR-03] egyetlen hibás rekord (${leiras}) nem viszi el a többi orvos, tétel és ár adatait; egyszer szól, a sérült másolat megmarad`, async ({ context }) => {
      const sajat = JSON.stringify({
        formatum: 1,
        orvosok: [{ id: 'o1', nev: 'Kovács Éva' }, hibas, { id: 'o3', nev: 'Szabó Péter' }],
        tetelek: [{ id: 't1', nev: 'Cirkon korona' }, { id: 't2', nev: 'Ínymaszk' }],
        arak: { t1: { o1: 52000, o3: 54000 }, t2: { o1: 9000 } }
      });
      await uzenetNaploIndit(context);
      const { p } = await lapNyers(context, { [KULCS.adatok]: sajat });
      await expect(p.locator('#orvosValaszto button[role=radio]'), 'a két érvényes orvos megmarad (nem a mintaadatok jönnek)').toHaveText(['Kovács Éva', 'Szabó Péter']);
      await orvosValaszt(p, 'Kovács Éva');
      await expect(tetelSor(p, 'Cirkon korona').locator('.tetel-ar')).toContainText(/52\s000\sFt/);
      await expect(tetelSor(p, 'Ínymaszk').locator('.tetel-ar')).toContainText(/9\s000\sFt/);
      await orvosValaszt(p, 'Szabó Péter');
      await expect(tetelSor(p, 'Cirkon korona').locator('.tetel-ar')).toContainText(/54\s000\sFt/);
      // a 15 mp-ig látszó értesítés a naplóból (terhelt gépen se maradjon le)
      await expect.poll(() => uzenetNaplo(p).then(n => n.filter(x => x.startsWith('hiba: ')).length), { message: 'egy értesítés a kihagyott rekordról' }).toBe(1);
      const masolat = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dentAl.serult.')).map(k => localStorage.getItem(k)));
      // (a másolat formája: a nyers szöveg, vagy — mint ma az ir()-rel — JSON-szövegként elmentve)
      const eredeti = masolat.map(m => { try { const x = JSON.parse(m); return typeof x === 'string' ? x : m; } catch (e) { return m; } });
      expect(eredeti, 'az eredeti tartalom külön másolatban megmarad').toEqual([sajat]);
      await p.close();
    });
  }
});

/* ======================================================================
   Mentés fájlba / visszatöltés, link: az adatok nem vesznek el
   ====================================================================== */
async function jsonMentes(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#jsonMentesGomb').click()]);
  return { nev: dl.suggestedFilename(), bajtok: fs.readFileSync(await dl.path()) };
}
async function jsonVisszatoltes(page, bajtok) {
  await page.locator('#jsonFajl').setInputFiles({ name: 'mentes.json', mimeType: 'application/json', buffer: bajtok });
  await expect(page.locator('#dlg #dlgCim')).toHaveText('Mentés visszatöltése');
}
const taroltAdat = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KULCS.adatok);
// a tárolt adatból: orvos (névkezdet) × tétel (névkezdet) → ár
function arNevSzerint(a, orvosEleje, tetelEleje) {
  const o = a.orvosok.find(x => x.nev.startsWith(orvosEleje)), t = a.tetelek.find(x => x.nev.startsWith(tetelEleje));
  return o && t && a.arak[t.id] ? (a.arak[t.id][o.id] ?? null) : null;
}

test.describe('mentés és visszatöltés', () => {
  test('mentés fájlba → visszatöltés változatlan adatnál: „nincs mit frissíteni”, e-mailek és csoportok is megmaradnak', async ({ page }) => {
    const a = adatok({ orvosok: [{ nev: 'Kovács Éva', email: 'eva@rendelo.hu' }, 'Szabó Péter'], tetelek: [['Cirkon korona', [52000, 54000], 'Protetika'], ['Ínymaszk', [9000, null], 'Egyéb munkák']] });
    await nyit(page, { adat: a, ido: IDO, hash: '#arak' });
    const { nev, bajtok } = await jsonMentes(page);
    expect(nev).toBe('dental_arak_2026-10-10.json');
    const j = JSON.parse(bajtok.toString('utf8'));
    expect(j.emailek).toEqual({ 'Kovács Éva': 'eva@rendelo.hu' });
    await jsonVisszatoltes(page, bajtok);
    await expect(page.locator('#dlg .allapot-sor.jo')).toContainText('nincs mit frissíteni');
  });

  test('[TAR-01] mentés fájlba → visszatöltés hosszú (120+ karakteres) orvosnévvel: egyetlen ár sem vész el', async ({ page }) => {
    // Hosszú név Excel-importtal kerülhet be (ott nincs hosszkorlát); a visszatöltés a nevet 120 karakterre vágja,
    // az árak kulcsát viszont nem, ezért az orvos minden ára csendben elveszik.
    const hosszu = 'Dr. ' + 'Hosszúnevű '.repeat(13).trim();
    const hosszuTetel = 'Implantátum felépítmény '.repeat(10).trim();
    const a = adatok({ orvosok: [hosszu, 'Rövid Rita'], tetelek: [['Korona', [1000, 2000]], [hosszuTetel, [3000, 4000]]] });
    await nyit(page, { adat: a, ido: IDO, hash: '#arak' });
    const { bajtok } = await jsonMentes(page);
    await jsonVisszatoltes(page, bajtok);
    const megerosit = page.locator('#dlg .dlg-lab button').last();
    if (!(await page.locator('#dlg .allapot-sor.jo').count())) await megerosit.click();
    await expect(page.locator('#dlg[open]')).toHaveCount(0);
    const most = await taroltAdat(page);
    const arak = {
      'hosszú orvos × Korona': arNevSzerint(most, hosszu.slice(0, 100), 'Korona'),
      'hosszú orvos × hosszú tétel': arNevSzerint(most, hosszu.slice(0, 100), hosszuTetel.slice(0, 100)),
      'Rövid Rita × Korona': arNevSzerint(most, 'Rövid Rita', 'Korona'),
      'Rövid Rita × hosszú tétel': arNevSzerint(most, 'Rövid Rita', hosszuTetel.slice(0, 100))
    };
    expect(arak).toEqual({ 'hosszú orvos × Korona': 1000, 'hosszú orvos × hosszú tétel': 3000, 'Rövid Rita × Korona': 2000, 'Rövid Rita × hosszú tétel': 4000 });
  });

  test('[TAR-01] link-import hosszú (120+ karakteres) orvosnévvel: az orvos árai megérkeznek', async ({ page, context }) => {
    const hosszu = 'Dr. ' + 'Hosszúnevű '.repeat(13).trim();
    await nyit(page, { ido: IDO });
    const link = await page.evaluate(([h]) => window.dentAl.linkKeszit({ orvosok: [h, 'Rövid Rita'], emailek: {}, tetelek: [{ nev: 'Korona', arak: { [h]: 1000, 'Rövid Rita': 2000 }, csoport: '' }] }), [hosszu]);
    const p2 = await context.newPage();
    await p2.goto(link);
    await expect(p2.locator('#dlg #dlgCim')).toHaveText('Árak betöltése linkből');
    await p2.locator('#dlg .dlg-lab button').last().click();
    await expect(p2.locator('#dlg[open]')).toHaveCount(0);
    const most = await taroltAdat(p2);
    expect({ hosszu: arNevSzerint(most, hosszu.slice(0, 100), 'Korona'), rovid: arNevSzerint(most, 'Rövid Rita', 'Korona') }).toEqual({ hosszu: 1000, rovid: 2000 });
  });

  test('másik lapon módosított adat: az érvényes változás átjön, a sérült nem írja felül a meglévőt', async ({ page, context }) => {
    const a = adatok({ orvosok: ['Kovács Éva', 'Szabó Péter'], tetelek: [['Korona', [1000, 2000]]] });
    await nyit(page, { adat: a, ido: IDO });
    const p2 = await context.newPage();
    await p2.goto('/index.html'); await kesz(p2);
    await p2.evaluate(k => localStorage.setItem(k, '{sérült'), KULCS.adatok);
    await page.waitForTimeout(500);
    await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(['Kovács Éva', 'Szabó Péter']);
    const uj = adatok({ orvosok: ['Kovács Éva', 'Szabó Péter', 'Nagy Anna'], tetelek: [['Korona', [1000, 2000, 3000]]] });
    await p2.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KULCS.adatok, uj]);
    await expect(page.locator('#orvosValaszto button[role=radio]')).toHaveText(['Kovács Éva', 'Szabó Péter', 'Nagy Anna']);
  });
});
