// 4. Akadálymentesség: axe-core (WCAG 2.0/2.1 A és AA) minden fő állapotban és párbeszédablakban, billentyűzetes bejárás
// (Tab, nyilak a rádiócsoportban, Enter/Szóköz, Escape + a fókusz visszatér), látható fókusz, címkék és hozzáférhető nevek,
// a hibaüzenetek bejelentése, újrarendeződés 320 px szélességben.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, nyit, adatok, valasztas } from './segito.js';
import { ALLAPOTOK, ALLAPOT_NEVEK, TOVABBI_ALLAPOTOK, IDO, kep, elrendezesMeres, kontrasztFv, EXCEL_VALTOZOTT } from './segito-mobil.js';

const AXE_CIMKEK = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MIND = Object.assign({}, ALLAPOTOK, TOVABBI_ALLAPOTOK);
// a csoportosított tétellista (csoportcím-sor role=presentation a <ul>-ben) ezekben az állapotokban látszik
// A11Y-06: kis képernyőn (360×740) a görgethető párbeszédablak-tartalom (.dlg-tartalom) billentyűzettel nem érhető el
const AXE_HIBA = { kitoltott: 'A11Y-01', kereso: 'A11Y-01', kesz: 'A11Y-01', orvosLista: 'A11Y-01', pdfElonezet: 'A11Y-06', linkElonezet: 'A11Y-06' };

/* ====================================================================== axe-core */
test.describe('axe-core: nincs WCAG 2.0/2.1 A/AA szabálysértés', () => {
  for (const nev of ALLAPOT_NEVEK.concat(Object.keys(TOVABBI_ALLAPOTOK))) {
    const id = AXE_HIBA[nev];
    test(`${id ? `[${id}] ` : ''}${nev}`, async ({ page }) => {
      await MIND[nev](page);
      const r = await new AxeBuilder({ page }).withTags(AXE_CIMKEK).analyze();
      const hibak = r.violations.map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
      expect(hibak).toEqual([]);
    });
  }
});

/* ====================================================================== billentyűzet */
// a fókuszált elem rövid azonosítója
const fokuszJel = page => page.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body || e === document.documentElement) return null;
  if (e.getAttribute('role') === 'radio') return 'rádió' + (e.getAttribute('aria-checked') === 'true' ? ':kijelölt' : '');
  if (e.id) return '#' + e.id;
  for (const o of ['menny', 'lep-plusz', 'lep-minusz', 'sor-gomb', 'fej-gomb', 'ar-mezo', 'logo']) if (e.classList.contains(o)) return '.' + o;
  return e.tagName.toLowerCase();
});

test.describe('billentyűzetes kezelés', () => {
  test('Tab-bal bejárható: orvosválasztó (egyetlen tabulátorhely), dátum, kereső, mennyiségmezők, ± gombok, a sáv gombjai, sorrendben', async ({ page }) => {
    await ALLAPOTOK.kitoltott(page);
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    const sor = [];
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const j = await fokuszJel(page);
      if (j) sor.push(j);
      if (j === '#gmailGomb') break;
    }
    expect(sor.filter(x => x.startsWith('rádió')), 'a rádiócsoportból csak a kijelölt orvos tabulátorhely').toEqual(['rádió:kijelölt']);
    const vart = ['rádió:kijelölt', '#datumMezo', '#kereso', '.lep-minusz', '.menny', '.lep-plusz', '#elonezetGomb', '#letoltGomb', '#gmailGomb'];
    for (const v of vart) expect(sor, `a Tab eléri: ${v}`).toContain(v);
    const helyek = vart.map(v => sor.indexOf(v));
    expect(helyek, 'a bejárás sorrendje a vizuális sorrendet követi').toEqual([...helyek].sort((a, b) => a - b));
    expect(sor.filter(x => x === '.menny').length, 'minden (14) mennyiségmező elérhető').toBe(14);
  });

  test('rádiócsoport: a nyilak, a Home és az End lépteti és ki is jelöli az orvost; Szóköz és Enter kijelöl', async ({ page }) => {
    await nyit(page, { adat: adatok({ orvosok: ['Peti', 'Dani', 'Anna'] }), ido: IDO });
    const radio = n => page.locator('#orvosValaszto [role=radio]').nth(n);
    const csoport = page.locator('#orvosValaszto [role=radiogroup]');
    await expect(csoport).toHaveAccessibleName('Orvos');
    // orvos nélkül az első rádió a tabulátorhely
    await page.locator('#datumMezo').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(radio(0)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(radio(0)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(radio(1)).toBeFocused();
    await expect(radio(1)).toHaveAttribute('aria-checked', 'true');
    await expect(radio(0)).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('ArrowDown');
    await expect(radio(2)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');                          // körbe ér
    await expect(radio(0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(radio(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(radio(0)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(radio(2)).toHaveAttribute('aria-checked', 'true');
    expect(await page.locator('#orvosValaszto [role=radio][tabindex="0"]').count(), 'egyetlen tabulátorhely').toBe(1);
    await expect(radio(2)).toHaveAttribute('tabindex', '0');
    await radio(1).focus();
    await page.keyboard.press('Enter');
    await expect(radio(1)).toHaveAttribute('aria-checked', 'true');
  });

  test('[A11Y-05] Enter és Szóköz: a ± gombok léptetnek, a „PDF letöltése” letölt, és a fókusz a kész panelre kerül (nem vész el); az „Új árlista” után visszakerül', async ({ page }) => {
    // Lassabb eszköz utánzása: a PDF-készítés 400 ms-mal tovább tart. Így a hiba determinisztikus: a készítés alatt
    // letiltott, fókuszban lévő gombról mindkét motor leveszi a fókuszt — a javítás után mindig zöld. 1.7.0 óta a PDF
    // Web Workerben készül: a Worker válaszai késnek; ha a fő szálon készülne (tartalék), a pdfmake getBlob()-ja.
    await page.addInitScript(() => {
      const E = window.Worker; if (!E) return;
      window.Worker = class extends E {
        set onmessage(fn) { super.onmessage = typeof fn === 'function' ? e => setTimeout(() => fn.call(this, e), 400) : fn; }
        get onmessage() { return super.onmessage; }
      };
    });
    await ALLAPOTOK.kitoltott(page);
    await page.evaluate(() => {
      const pm = window.pdfMake; if (!pm || typeof pm.createPdf !== 'function') return;
      const eredeti = pm.createPdf.bind(pm);
      pm.createPdf = (...x) => { const d = eredeti(...x); const g = d.getBlob.bind(d); d.getBlob = (...y) => g(...y).then(b => new Promise(r => setTimeout(() => r(b), 400))); return d; };
    });
    const plusz = page.locator('#tetelLista .lep-plusz').first();
    const mezo = page.locator('#tetelLista input.menny').first();
    await plusz.focus();
    await page.keyboard.press('Enter');
    await expect(mezo).toHaveValue('4');
    await page.keyboard.press('Space');
    await expect(mezo).toHaveValue('5');
    // mennyiség-változás után rögtön letöltés: a PDF ekkor még nincs előre elkészítve (ez a gyakori eset)
    await page.locator('#tetelLista .lep-minusz').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('#letoltGomb').focus();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(dl.suggestedFilename()).toMatch(/^Arlista_.+_2026-10-10\.pdf$/);
    await expect(page.locator('#savKesz')).toBeVisible();
    // a fókusz a kész panel első gombjára kerül (nem a dokumentum törzsére)
    await expect.poll(() => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)), { message: 'a fókusz a kész panel „Letöltés újra” gombjára kerül' }).toBe('keszLetoltGomb');
    await page.locator('#keszUjGomb').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#savNormal')).toBeVisible();
    await expect(page.locator('#letoltGomb')).toBeFocused();
  });

  // Escape bezárja a párbeszédablakot, és a fókusz visszakerül a megnyitó gombra
  const ESCAPE = [
    ['Előnézet', async page => { await ALLAPOTOK.kitoltott(page); return '#elonezetGomb'; }, null],
    ['Hiányzó ár', async page => {
      const a = adatok({ orvosok: ['Peti'], tetelek: [['tetel1', [1000]], ['tetel2', [null]]] });
      await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 1, tetel2: 1 } }), ido: IDO });
      return '#letoltGomb';
    }, null],
    ['Új tétel', async page => { await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' }); return '#ujTetelGomb'; }, '#nevMezo'],
    ['Tétel szerkesztése', async page => { await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' }); return '#arTabla .sor-gomb[data-tetel="t2"]'; }, '#nevMezo'],
    ['Küldés linkben', async page => { await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' }); return '#linkKuldesGomb'; }, null]
  ];
  for (const [nev, elokeszit, fokuszBent] of ESCAPE) {
    test(`Escape bezárja: ${nev}; nyitáskor a fókusz az ablakba kerül és ott marad, bezáráskor vissza a megnyitó gombra`, async ({ page }) => {
      const nyito = await elokeszit(page);
      await page.locator(nyito).focus();
      await page.keyboard.press('Enter');
      const dlg = page.locator('#dlg');
      await expect(dlg).toBeVisible();
      await expect(dlg).toHaveAttribute('aria-labelledby', 'dlgCim');
      await expect(dlg).toHaveAccessibleName((await page.locator('#dlgCim').innerText()).trim());
      if (fokuszBent) await expect(page.locator(fokuszBent)).toBeFocused();
      await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('#dlg')), { message: 'a fókusz az ablakban van' }).toBe(true);
      // Tab nem hagyja el a modális ablakot
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const kint = await page.evaluate(() => { const e = document.activeElement; return !!e && e !== document.body && !e.closest('#dlg'); });
        expect(kint, 'Tab a modális ablakon kívülre vitte a fókuszt').toBe(false);
      }
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
      await expect(page.locator(nyito)).toBeFocused();
    });
  }

  test('Escape: az Excel-import előnézete bezárul, a fókusz visszakerül az „Excel-fájl kiválasztása” gombra, és nem változik semmi', async ({ page }) => {
    await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' });
    await page.locator('#excelGomb').focus();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
    await fc.setFiles(EXCEL_VALTOZOTT);
    await expect(page.locator('#dlgCim')).toHaveText('Excel-import előnézete');
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlg')).toBeHidden();
    await expect(page.locator('#excelGomb')).toBeFocused();
    await expect(page.locator('#arTabla .fej-gomb')).toHaveCount(3);
  });

  test('a kereső kombinált mezője: le/fel nyíl lépteti a találatokat (aria-activedescendant), Enter hozzáadja, Escape törli', async ({ page }) => {
    await ALLAPOTOK.kereso(page);
    const k = page.locator('#kereso');
    await expect(k).toHaveAttribute('aria-expanded', 'true');
    await expect(k).toHaveAttribute('aria-activedescendant', 'talalat-0');
    await page.keyboard.press('ArrowDown');
    await expect(k).toHaveAttribute('aria-activedescendant', 'talalat-1');
    await expect(page.locator('#talalat-1')).toHaveAttribute('aria-selected', 'true');
    const nev = (await page.locator('#talalat-1 .opcio-nev').innerText()).trim();
    await page.keyboard.press('Enter');
    await expect(page.locator('#keresoAllapot')).toContainText(`Hozzáadva: ${nev}`);
    await expect(k).toBeFocused();
    await k.fill('korona');
    await expect(k).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(k).toHaveValue('');
    await expect(k).toHaveAttribute('aria-expanded', 'false');
  });
});

/* ====================================================================== látható fókusz */
// a fókuszjelzés: körvonal vagy árnyék, legalább 2 px, a mögötte lévő színhez képest legalább 3:1 kontraszt
function fokuszJelzes(page) {
  return page.evaluate(new Function(`${kontrasztFv()}
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    let atl = 1; for (let p = e; p; p = p.parentElement) atl *= Number(getComputedStyle(p).opacity);
    const cs = getComputedStyle(e);
    const ok = [];
    const kulsoHatter = hatterSzin(e.parentElement), belsoHatter = hatterSzin(e);
    if (atl > 0.5 && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) {
      const c = szinParse(cs.outlineColor); if (c && c.a > 0.5) ok.push({ mod: 'körvonal', k: kontraszt(c, kulsoHatter) });
    }
    const arnyekok = (el, kulso, belso) => {
      const s = getComputedStyle(el).boxShadow; if (!s || s === 'none') return [];
      return s.split(/,(?![^(]*\\))/).map(x => {
        const c = szinParse(x); const szamok = (x.replace(/rgba?\\([^)]*\\)/, '').match(/-?[\\d.]+px/g) || []).map(parseFloat);
        const inset = /inset/.test(x); const terjedes = szamok[3] || 0;
        return c && c.a > 0.5 && terjedes >= 2 ? { mod: inset ? 'belső árnyék' : 'árnyék', k: kontraszt(c, inset ? belso : kulso) } : null;
      }).filter(Boolean);
    };
    if (atl > 0.5) ok.push(...arnyekok(e, kulsoHatter, belsoHatter));
    // a láthatatlan (opacity: 0) mező helyett a befoglaló címke (pl. a dátum) :focus-within jelzése számít
    if (atl <= 0.5) {
      const l = e.closest('label');
      if (l) {
        ok.push(...arnyekok(l, hatterSzin(l.parentElement), hatterSzin(l)));
        const lc = getComputedStyle(l);
        if (lc.outlineStyle !== 'none' && parseFloat(lc.outlineWidth) >= 2) ok.push({ mod: 'címke körvonala', k: kontraszt(szinParse(lc.outlineColor), hatterSzin(l.parentElement)) });
      }
    }
    const legjobb = ok.sort((a, b) => b.k - a.k)[0] || null;
    return { elem: e.id ? '#' + e.id : (e.className || e.tagName), legjobb: legjobb ? { mod: legjobb.mod, k: Math.round(legjobb.k * 100) / 100 } : null };
  `));
}

test('[A11Y-02] minden billentyűzettel elérhető elem fókuszjelzése legalább 2 px-es és 3:1 kontrasztú (lista, Árak, párbeszédablak)', async ({ page }, testInfo) => {
  const gyenge = new Map();
  const vizsgal = async hol => {
    const f = await fokuszJelzes(page);
    if (!f) return null;
    if ((!f.legjobb || f.legjobb.k < 3) && !gyenge.has(`${hol}: ${f.elem}`)) {
      gyenge.set(`${hol}: ${f.elem}`, f.legjobb ? `${f.legjobb.mod}, ${f.legjobb.k}:1` : 'nincs látható jelzés');
      await kep(page, testInfo, `fokusz_gyenge_${gyenge.size}`);
    }
    return f;
  };
  const bejar = async (hol, db, megallj = async () => false) => {
    for (let i = 0; i < db; i++) {
      await page.keyboard.press('Tab');
      await vizsgal(hol);
      if (await megallj()) break;
    }
  };
  await ALLAPOTOK.kitoltott(page);
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  await bejar('lista', 70, async () => (await fokuszJel(page)) === '#gmailGomb');
  await page.locator('#nezetGomb').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await bejar('Árak', 90);
  await page.locator('#ujTetelGomb').click();
  await expect(page.locator('#nevMezo')).toBeFocused();
  await vizsgal('Új tétel ablak');
  await bejar('Új tétel ablak', 5);
  expect([...gyenge].map(([k, v]) => `${k} (${v})`)).toEqual([]);
});

/* ====================================================================== címkék, nevek, bejelentések */
test.describe('címkék és hozzáférhető nevek', () => {
  // A11Y-04: az Árak nézetben a fejléc „Árlista” gombjának neve „Vissza az árlistához” – a látható szó nincs benne (WCAG 2.5.3)
  for (const nev of ['kitoltott', 'orvosLista', 'arak', 'kesz', 'pdfElonezet', 'importElonezet', 'tetelSzerk', 'orvosSzerk', 'linkBetoltes']) {
    test(`${nev === 'arak' ? '[A11Y-04] ' : ''}${nev}: minden mezőnek, legördülőnek és gombnak van neve; a gomb látható felirata benne van a nevében`, async ({ page }) => {
      const l = await MIND[nev](page);
      const hibak = await page.evaluate(gy => {
        const gyoker = gy ? document.querySelector(gy) : document;
        const szoveg = n => (n || '').replace(/\s+/g, ' ').trim();
        const latszik = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
        const lathatoSzoveg = e => { let s = ''; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const p = w.currentNode.parentElement; if (p.closest('.lathatatlan,[aria-hidden=true]')) continue; s += w.currentNode.textContent; } return szoveg(s); };
        const nevE = e => {
          const lb = e.getAttribute('aria-labelledby');
          if (lb) return szoveg(lb.split(/\s+/).map(id => { const x = document.getElementById(id); return x ? x.textContent : ''; }).join(' '));
          if (e.getAttribute('aria-label')) return szoveg(e.getAttribute('aria-label'));
          if (e.labels && e.labels.length) return szoveg(Array.from(e.labels).map(x => x.textContent).join(' '));
          if (/^(BUTTON|A|SUMMARY)$/.test(e.tagName) || ['radio', 'option'].includes(e.getAttribute('role'))) return szoveg(e.textContent) || szoveg(e.title);
          return szoveg(e.title);
        };
        const r = [];
        for (const e of gyoker.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=option], summary')) {
          if (!latszik(e) || e.closest('.lathatatlan')) continue;
          const n = nevE(e);
          const azon = e.id ? '#' + e.id : `${e.tagName.toLowerCase()}.${e.className}`;
          if (!n) { r.push(`${azon}: nincs neve`); continue; }
          const v = lathatoSzoveg(e);
          if (e.tagName === 'BUTTON' && v && !n.toLocaleLowerCase('hu').includes(v.toLocaleLowerCase('hu').replace(/…$/, ''))) r.push(`${azon}: a név („${n}”) nem tartalmazza a látható feliratot („${v}”)`);
        }
        return r;
      }, l.dialogus ? '#dlg' : null);
      expect(hibak).toEqual([]);
    });
  }
});

test('[A11Y-06] a görgethető párbeszédablak-tartalom billentyűzettel is görgethető (Tab-bal elérhető maga a tartalom vagy egy elem benne)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });            // kis képernyő: az előnézet nem fér ki, görgetni kell
  await ALLAPOTOK.pdfElonezet(page);
  const r = await page.evaluate(() => {
    const t = document.querySelector('#dlg .dlg-tartalom');
    return { gorgetheto: t.scrollHeight > t.clientHeight + 1 };
  });
  await kep(page, testInfo, 'elonezet_640');
  expect(r.gorgetheto, 'a próba feltétele: az előnézet 640 px magasan görgethető').toBe(true);
  // a tényleges billentyűzetes elérés: Tab-bal végig az ablakon (a Chromium 130+ a görgethető tartományt magától is
  // fókuszálhatóvá teszi — ott ez ma is teljesül —, a WebKit nem: ott a tabindex="0" kell)
  let elerheto = false;
  for (let i = 0; i < 8 && !elerheto; i++) {
    await page.keyboard.press('Tab');
    elerheto = await page.evaluate(() => { const t = document.querySelector('#dlg .dlg-tartalom'); const e = document.activeElement; return !!t && !!e && (e === t || t.contains(e)); });
  }
  expect(elerheto, 'a görgethető tartalom Tab-bal nem érhető el (nincs tabindex, nincs benne fókuszálható elem)').toBe(true);
});

test('[A11Y-03] „Válassz orvost” hiba: a képernyőolvasó is bejelenti (élő régió vagy a fókuszált rádiócsoport leírása)', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { tetel1: 2 } }), ido: IDO });
  await page.locator('#letoltGomb').click();
  await expect(page.locator('#orvosHiba')).toBeVisible();
  const r = await page.evaluate(() => {
    const h = document.querySelector('#orvosHiba');
    const elo = !!h.closest('[aria-live]:not([aria-live=off]), [role=alert], [role=status]');
    const f = document.activeElement;
    const leiras = [f, f.closest('[role=radiogroup]'), f.closest('select')].filter(Boolean)
      .some(x => (x.getAttribute('aria-describedby') || '').split(/\s+/).includes('orvosHiba') || (x.getAttribute('aria-errormessage') || '') === 'orvosHiba');
    return { elo, leiras, fokusz: f.getAttribute('role') || f.tagName };
  });
  expect(r.fokusz).toBe('radio');
  expect(r.elo || r.leiras, 'a hibaüzenet nincs élő régióban, és a fókuszált rádiócsoport sem hivatkozik rá (aria-describedby)').toBe(true);
});

test('a sáv hibaüzenete („Adj meg mennyiséget…”) élő régióban jelenik meg (role=status)', async ({ page }) => {
  await ALLAPOTOK.hibaUres(page);
  const u = page.locator('#savUzenet');
  await expect(u).toHaveAttribute('role', 'status');
  await expect(u).toHaveAttribute('aria-live', 'polite');
  await expect(u).toContainText('Adj meg mennyiséget');
});

test('a nagyítás nincs letiltva (viewport meta: nincs user-scalable=no, maximum-scale), és a lap nyelve magyar', async ({ page }) => {
  await ALLAPOTOK.ures(page);
  const meta = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(meta).toContain('width=device-width');
  expect(meta).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
  expect(meta).not.toMatch(/maximum-scale\s*=\s*(0|1(\.0*)?)(\D|$)/i);
  expect(await page.locator('html').getAttribute('lang')).toBe('hu');
});

/* ====================================================================== újrarendeződés 320 px-en */
test.describe('újrarendeződés 320 px szélességben (WCAG 1.4.10): nincs vízszintes görgetés, semmi nem lóg ki', () => {
  for (const nev of ['ures', 'kitoltott', 'hibaUres', 'kesz', 'arak', 'pdfElonezet', 'importElonezet']) {
    test(nev, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 640 });
      const l = await ALLAPOTOK[nev](page);
      await kep(page, testInfo, '320_' + nev);
      const m = await elrendezesMeres(page, { gyoker: l.dialogus ? '#dlg' : null });
      expect.soft(m.gorgetesX, 'vízszintes görgetés').toBe(0);
      expect.soft(m.kilogo, 'kilógó elemek').toEqual([]);
      expect(m.levagott, 'levágott szöveg').toEqual([]);
    });
  }
});
