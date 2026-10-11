// A mobil- és akadálymentességi tesztek (40, 41) saját segédfüggvényei:
// - a fő állapotok előállítása (üres, kitöltött, hibaüzenetek, Árak, import-előnézet, PDF-előnézet, kész panel, link-előnézet),
// - elrendezés-mérés (vízszintes görgetés, kilógás, levágott szöveg, érintési célméret, az alsó sáv takarása),
// - Web Share API utánzat (navigator.share / canShare),
// - képernyőképek a tests/kimenet/mobil/<projekt>/<állapot>.png helyre.
import path from 'node:path';
import { expect, nyit, adatok, valasztas, kimenetUt, FIXTURES, pdfKesz, letoltes } from './segito.js';

export const IDO = '2026-10-10T09:00:00';
export const EXCEL_VALTOZOTT = path.join(FIXTURES, 'excel', 'arak_valtozott.xlsx');
export const MIN_CEL = 48;                       // a felhasználó követelménye: minden gomb legalább 48 px magas

export const mobilProjekt = testInfo => !!testInfo.project.use.isMobile;
export const motor = testInfo => testInfo.project.use.browserName;

/* ---------------------------------------------------------------- adatok */
// valószerű, hosszú nevek, csoportok, 14 tétel (> 8: kereső is van), 4 orvos (keskeny képernyőn 2 oszlopos szegmens)
export const HOSSZU_ORVOSOK = ['Szentgyörgyi-Halmágyi Eszter', 'Kovács Ödön', 'Bárány-Fekete Zsófia', 'Nagy Ő'];
export const HOSSZU_TETELEK = [
  ['Cirkónium-oxid korona, monolit, CAD/CAM marással (front- és rágófog)', [52000, 54500, 49900, 51000], 'Protetika'],
  ['Fémkerámia korona', [28000, 29500, 27000, 30000], 'Protetika'],
  ['Lítium-diszilikát (e.max) héj, rétegzett, egyedi színezéssel', [61000, 65000, 59900, 60000], 'Protetika'],
  ['Ideiglenes korona (PMMA)', [6500, 7000, 6000, 6200], 'Protetika'],
  ['Teleszkópos korona, primer és szekunder rész', [88000, 90000, 85000, 86000], 'Protetika'],
  ['Kivehető fogszabályozó készülék, egyállcsontos, csavarral', [45000, 47000, 44000, 46000], 'Fogszabályozás'],
  ['Retainer (sín) 1 mm', [9000, 9500, 8800, 9100], 'Fogszabályozás'],
  ['Harapásemelő sín (Michigan)', [24000, 25000, 23000, 24500], 'Fogszabályozás'],
  ['Implantátumra csavarozott cirkónium korona, titánbázissal', [98000, 99000, 97000, 99900], 'Implantológia'],
  ['Egyedi abutment (titán)', [42000, 43000, 41000, 42500], 'Implantológia'],
  ['Fúrósablon (3D nyomtatott)', [18000, 18500, 17500, 18200], 'Implantológia'],
  ['Javítás', [5000, 5500, 4800, 5200], ''],
  ['Alábélelés: Szuperhosszúszóösszetételűkerámiakoronajavításiművelet', [12000, 12500, 11800, 12100], ''],
  ['Szállítási díj', [1500, 1500, 1500, 1500], '']
];
export const kitoltottAdat = () => adatok({ orvosok: HOSSZU_ORVOSOK, tetelek: HOSSZU_TETELEK });
export const KITOLTOTT_MENNY = {
  'Cirkónium-oxid korona, monolit, CAD/CAM marással (front- és rágófog)': 3,
  'Lítium-diszilikát (e.max) héj, rétegzett, egyedi színezéssel': 12,
  'Retainer (sín) 1 mm': 2,
  'Implantátumra csavarozott cirkónium korona, titánbázissal': 1,
  'Szállítási díj': 1
};

/* ---------------------------------------------------------------- állapotok */
// Minden állapot: async (page, ctx) => leírás { dialogus: bool, nezet: 'lista' | 'arak' }
export const ALLAPOTOK = {
  async ures(page) {
    await nyit(page, { adat: adatok(), ido: IDO });
    return { nezet: 'lista' };
  },
  async kitoltott(page) {
    const a = kitoltottAdat();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: HOSSZU_ORVOSOK[0], menny: KITOLTOTT_MENNY }), ido: IDO });
    return { nezet: 'lista' };
  },
  async kereso(page) {                            // a kereső legördülő találatlistája nyitva
    const a = kitoltottAdat();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: HOSSZU_ORVOSOK[0] }), ido: IDO });
    await page.locator('#kereso').fill('korona');
    await expect(page.locator('#keresoLista')).toBeVisible();
    return { nezet: 'lista', reszlet: '#keresoDoboz' };
  },
  async hibaNincsOrvos(page) {
    const a = adatok();
    await nyit(page, { adat: a, valasztas: valasztas(a, { menny: { tetel1: 2 } }), ido: IDO });
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#orvosHiba')).toBeVisible();
    await varGorgetes(page);
    return { nezet: 'lista' };
  },
  async hibaUres(page) {
    const a = adatok();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti' }), ido: IDO });
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#savUzenet')).toBeVisible();
    await varGorgetes(page);
    return { nezet: 'lista' };
  },
  async hibaArhiany(page) {                       // hiányzó ár: a sáv figyelmeztetése és a „Hiányzó ár” párbeszédablak
    const a = adatok({ orvosok: ['Peti', 'Dani'], tetelek: [['tetel1', [10000, 15500]], ['Cirkónium korona hosszú megnevezéssel', [null, 52000]], ['tetel3', [9000, 1000]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 1, 'Cirkónium korona hosszú megnevezéssel': 2 } }), ido: IDO });
    await expect(page.locator('#savUzenet')).toBeVisible();
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#dlg')).toBeVisible();
    return { nezet: 'lista', dialogus: true };
  },
  async tulcsordul(page) {                        // 90 tétel: nem fér el egy oldalon → a sáv tartós figyelmeztetése
    const n = 90;
    const a = adatok({ orvosok: ['Peti'], tetelek: Array.from({ length: n }, (_, i) => [`Tétel ${String(i + 1).padStart(2, '0')} hosszabb megnevezéssel`, [1000 + i]]) });
    const menny = {}; a.tetelek.forEach(t => { menny[t.id] = 1; });
    await nyit(page, { adat: a, valasztas: { orvosId: 'o1', menny, datum: null }, ido: IDO });
    await expect(page.locator('#savUzenet')).toContainText('nem fér el', { timeout: 45_000 });
    return { nezet: 'lista' };
  },
  async arak(page) {
    const a = kitoltottAdat();
    await nyit(page, { adat: a, ido: IDO, hash: '#arak' });
    await expect(page.locator('#arTabla')).toBeVisible();
    return { nezet: 'arak' };
  },
  async importElonezet(page) {
    await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' });
    // a SheetJS is betöltődött (különben a WebKit a letöltés közben hibát jelezhet). A közös pdfKesz() erre nem jó:
    // a waitForFunction az aszinkron predikátum Promise-át igaznak veszi, ezért nem vár — itt valódi várakozás kell.
    await expect.poll(() => page.evaluate(async () => (await window.dentAl.offlineAllapot()).kesz), { timeout: 45_000, intervals: [200, 300, 500] }).toBe(true);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#excelGomb').click()]);
    await fc.setFiles(EXCEL_VALTOZOTT);
    await expect(page.locator('#dlgCim')).toHaveText('Excel-import előnézete');
    return { nezet: 'arak', dialogus: true };
  },
  async pdfElonezet(page) {
    const a = kitoltottAdat();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: HOSSZU_ORVOSOK[0], menny: KITOLTOTT_MENNY }), ido: IDO });
    await page.locator('#elonezetGomb').click();
    await expect(page.locator('#dlg .elonezet-keret canvas')).toBeVisible({ timeout: 45_000 });
    return { nezet: 'lista', dialogus: true };
  },
  async kesz(page) {
    const a = kitoltottAdat();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: HOSSZU_ORVOSOK[0], menny: KITOLTOTT_MENNY }), ido: IDO });
    await letoltes(page);
    await expect(page.locator('#savKesz')).toBeVisible();
    return { nezet: 'lista' };
  },
  async linkElonezet(page) {
    // a link egy másik „eszközön” készül (ugyanebben a lapban), aztán a saját adatokkal nyitjuk meg
    await nyit(page, { adat: adatok(), ido: IDO });
    const link = await page.evaluate(() => window.dentAl.linkKeszit({
      orvosok: ['Szentgyörgyi-Halmágyi Eszter', 'Kovács Ödön'],
      emailek: {},
      tetelek: [
        { nev: 'Cirkónium-oxid korona, monolit, CAD/CAM marással', arak: { 'Szentgyörgyi-Halmágyi Eszter': 52000, 'Kovács Ödön': 54500 }, csoport: 'Protetika' },
        { nev: 'tetel1', arak: { 'Szentgyörgyi-Halmágyi Eszter': 11000, 'Kovács Ödön': 12000 }, csoport: '' },
        { nev: 'Retainer (sín) 1 mm', arak: { 'Szentgyörgyi-Halmágyi Eszter': 9000 }, csoport: 'Fogszabályozás' }
      ],
      csoportVan: true
    }));
    const hash = link.slice(link.indexOf('#'));
    await page.evaluate(h => { location.hash = h; }, hash);
    await expect(page.locator('#dlgCim')).toHaveText('Árak betöltése linkből');
    return { nezet: 'lista', dialogus: true };
  }
};
export const ALLAPOT_NEVEK = Object.keys(ALLAPOTOK);

// további párbeszédablakok és ritkább állapotok (az akadálymentességi és célméret-próbákhoz)
export const TOVABBI_ALLAPOTOK = {
  async orvosLista(page) {                        // > 4 orvos: legördülő lista
    const a = adatok({ orvosok: ['Szentgyörgyi-Halmágyi Eszter', 'Kovács Ödön', 'Bárány-Fekete Zsófia', 'Nagy Ő', 'Kiss Anna', 'Tóth Béla'], tetelek: HOSSZU_TETELEK.slice(0, 4).map(([n, p, c]) => [n, [...p, 1000, 2000], c]) });
    await nyit(page, { adat: a, ido: IDO });
    await expect(page.locator('#orvosSelect')).toBeVisible();
    return { nezet: 'lista' };
  },
  async ujTetel(page) {
    await nyit(page, { adat: kitoltottAdat(), ido: IDO, hash: '#arak' });
    await page.locator('#ujTetelGomb').click();
    await expect(page.locator('#dlgCim')).toHaveText('Új tétel');
    return { nezet: 'arak', dialogus: true };
  },
  async tetelSzerk(page) {
    await nyit(page, { adat: kitoltottAdat(), ido: IDO, hash: '#arak' });
    await page.locator('#arTabla .sor-gomb').nth(1).click();
    await expect(page.locator('#dlgCim')).toHaveText('Tétel szerkesztése');
    return { nezet: 'arak', dialogus: true };
  },
  async orvosSzerk(page) {
    await nyit(page, { adat: kitoltottAdat(), ido: IDO, hash: '#arak' });
    await page.locator('#arTabla .fej-gomb').first().click();
    await expect(page.locator('#dlgCim')).toHaveText('Orvos szerkesztése');
    return { nezet: 'arak', dialogus: true };
  },
  async linkKuldes(page) {
    await nyit(page, { adat: kitoltottAdat(), ido: IDO, hash: '#arak' });
    await page.locator('#linkKuldesGomb').click();
    await expect(page.locator('#dlgCim')).toHaveText('Küldés linkben');
    return { nezet: 'arak', dialogus: true };
  },
  async linkBetoltes(page) {
    await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' });
    await page.locator('#linkBetoltesGomb').click();
    await expect(page.locator('#dlgCim')).toHaveText('Betöltés linkből');
    return { nezet: 'arak', dialogus: true };
  },
  async sugoNyitva(page) {                        // Árak: GitHub-súgó kinyitva
    await nyit(page, { adat: adatok(), ido: IDO, hash: '#arak' });
    await page.locator('.sugo summary').click();
    await expect(page.locator('.sugo ol')).toBeVisible();
    return { nezet: 'arak' };
  },
  async hangEredmeny(page) {                      // bemondás (utánzott beszédfelismerővel): a kérdések gombjai
    await hangUtanzat(page, 'korona');
    const a = kitoltottAdat();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: HOSSZU_ORVOSOK[0] }), ido: IDO });
    await page.locator('#hangGomb').click();
    await expect(page.locator('#dlgCim')).toHaveText('Bemondás');
    await page.locator('#dlg .dlg-lab button', { hasText: 'Kész' }).click();
    await expect(page.locator('#dlg .cimke-gomb').first()).toBeVisible();
    return { nezet: 'lista', dialogus: true };
  }
};

/* ---------------------------------------------------------------- beszédfelismerés-utánzat */
// az első start() egyszer „kimondja” a szöveget; stop()/abort() után onend
export async function hangUtanzat(page, szoveg) {
  await page.addInitScript(sz => {
    let kimondva = false;
    class HamisFelismero {
      start() {
        setTimeout(() => {
          if (kimondva || !this.onresult) return;
          kimondva = true;
          const alt = Object.assign([{ transcript: sz, confidence: 0.9 }], { isFinal: true });
          this.onresult({ resultIndex: 0, results: [alt] });
        }, 30);
      }
      stop() { setTimeout(() => this.onend && this.onend(), 10); }
      abort() { setTimeout(() => this.onend && this.onend(), 10); }
    }
    window.SpeechRecognition = HamisFelismero; window.webkitSpeechRecognition = HamisFelismero;
  }, szoveg);
}

// beépített (alkalmazáson belüli) böngésző: a Facebook / Messenger felhasználói ügynöke
export const FBAN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/621000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/hu_HU;FBOP/5]';

// a sima görgetés (scrollIntoView smooth) végét kivárjuk
export async function varGorgetes(page) {
  let elozo = -1;
  await expect.poll(async () => {
    const y = await page.evaluate(() => window.scrollY);
    const ok = y === elozo; elozo = y; return ok;
  }, { intervals: [150, 150, 150, 250, 250, 500] }).toBe(true);
}

/* ---------------------------------------------------------------- képek */
export async function kep(page, testInfo, allapot, { teljes = false } = {}) {
  const ut = kimenetUt('mobil', testInfo.project.name, `${allapot}${teljes ? '_teljes' : ''}.png`);
  await page.screenshot({ path: ut, fullPage: teljes, animations: 'disabled', caret: 'hide' });
  return ut;
}

/* ---------------------------------------------------------------- elrendezés-mérés (a böngészőben) */
// gyoker: ha nyitva van egy modális párbeszédablak, csak azon belül mérünk (a háttér inert)
export function elrendezesMeres(page, { gyoker = null, min = MIN_CEL } = {}) {
  return page.evaluate(({ gyoker, min }) => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const r2 = n => Math.round(n * 10) / 10;
    const leir = e => {
      let s = e.tagName.toLowerCase();
      if (e.id) s += '#' + e.id;
      const o = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean);
      if (o.length) s += '.' + o.join('.');
      const szoveg = (e.getAttribute('aria-label') || e.textContent || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      return szoveg ? `${s} „${szoveg}”` : s;
    };
    const lathato = e => {
      if (e.checkVisibility) { if (!e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false; }
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // szándékosan csak képernyőolvasónak szóló szöveg (.lathatatlan, vagy clip-path: inset(50%) – pl. a „Bemondás” felirat keskeny kijelzőn)
    const vizuálisanRejtett = e => { for (let p = e; p && p !== document.body; p = p.parentElement) { if (p.classList.contains('lathatatlan')) return true; const cp = getComputedStyle(p).clipPath; if (cp && cp !== 'none') return true; } return false; };
    const gyokerEl = gyoker ? document.querySelector(gyoker) : document.body;
    // a vágó (overflow != visible) ősök: ezeken belül a kilógás szándékos (görgethető táblázat, lista)
    const vagoOs = e => {
      for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p;
      }
      return null;
    };
    const minden = Array.from(gyokerEl.querySelectorAll('*'));
    const kilogo = [];
    for (const e of minden) {
      if (!lathato(e) || vizuálisanRejtett(e)) continue;
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
      const r = e.getBoundingClientRect();
      if (r.right <= vw + 0.5 && r.left >= -0.5) continue;
      const os = vagoOs(e);
      if (os) { const ro = os.getBoundingClientRect(); if (r.right <= ro.right + 0.5 && r.left >= ro.left - 0.5) continue; if (ro.right <= vw + 0.5 && ro.left >= -0.5) continue; }
      kilogo.push({ elem: leir(e), bal: r2(r.left), jobb: r2(r.right), vw });
    }
    // levágott szöveg: a szöveges elem tartalma szélesebb a dobozánál, és a doboz vág (overflow hidden/clip, ellipsis)
    const levagott = [];
    for (const e of minden) {
      if (!lathato(e) || vizuálisanRejtett(e)) continue;
      if (!Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(e);
      const vag = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
      if (e.scrollWidth > e.clientWidth + 1 && vag) levagott.push({ elem: leir(e), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth });
      // szöveg, ami az ősének vágott dobozából lóg ki
      const os = vagoOs(e);
      if (os && getComputedStyle(os).overflowX === 'hidden') {
        const r = e.getBoundingClientRect(), ro = os.getBoundingClientRect();
        if (r.right > ro.right + 1 || r.left < ro.left - 1) levagott.push({ elem: leir(e), os: leir(os) });
      }
    }
    // érintési célok: gomb, link-gomb, mező, legördülő, rádió, opció, összecsukható összefoglaló
    const CEL = 'button, a.gomb, a.logo, input:not([type=hidden]), select, textarea, [role=radio], [role=option], summary';
    const kicsi = [];
    for (const e of gyokerEl.querySelectorAll(CEL)) {
      if (!lathato(e) || vizuálisanRejtett(e)) continue;
      if (e.getAttribute('aria-disabled') === 'true' && e.classList.contains('kereso-ures')) continue;   // „Nincs találat” sor
      let r = e.getBoundingClientRect();
      // nagyobb érintési felület: a mezőt magába foglaló <label> (jelölőnégyzet, dátum)
      const lab = e.closest('label');
      if (lab && (e.matches('input'))) { const rl = lab.getBoundingClientRect(); r = { width: Math.max(r.width, rl.width), height: Math.max(r.height, rl.height) }; }
      const magas = r2(r.height), szeles = r2(r.width);
      if (magas < min - 0.5 || szeles < min - 0.5) kicsi.push({ elem: leir(e), magas, szeles });
    }
    const dlg = document.querySelector('#dlg[open]');
    return {
      vw, vh,
      gorgetesX: document.documentElement.scrollWidth > vw + 0.5 ? document.documentElement.scrollWidth : 0,
      bodyGorgetesX: document.body.scrollWidth > vw + 0.5 ? document.body.scrollWidth : 0,
      dlgGorgetesX: dlg ? Array.from(dlg.querySelectorAll('*')).filter(e => { const cs = getComputedStyle(e); return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1; }).map(leir) : [],
      kilogo, levagott, kicsi
    };
  }, { gyoker, min });
}

// az alsó sáv takarása: a lap aljára görgetve az utolsó tartalom-elem alja a sáv teteje fölött van-e
export async function savTakaras(page, nezetSzelektor = '#nezetArlista') {
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await varGorgetes(page);
  return page.evaluate(sz => {
    const sav = document.querySelector('#sav');
    const savTeteje = sav.hidden ? window.innerHeight : sav.getBoundingClientRect().top;
    const nezet = document.querySelector(sz);
    const elemek = Array.from(nezet.querySelectorAll('li.tetel, button, a, input, select, p, .ures')).filter(e => {
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('.lathatatlan');
    });
    let utolso = null;
    for (const e of elemek) { const r = e.getBoundingClientRect(); if (!utolso || r.bottom > utolso.alja) utolso = { elem: (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + e.className), alja: Math.round(r.bottom * 10) / 10 }; }
    return { savTeteje: Math.round(savTeteje * 10) / 10, utolso, ablak: window.innerHeight };
  }, nezetSzelektor);
}

/* ---------------------------------------------------------------- Web Share utánzat */
// navigator.canShare / navigator.share: a hívásokat a window.__megosztasok tömb gyűjti;
// a viselkedés a window.__megosztasMod szerint: 'siker' | 'AbortError' | 'NotAllowedError' | 'nincsFajl' (canShare false a fájlra)
export async function megosztasUtanzat(page, { mod = 'siker' } = {}) {
  await page.addInitScript(alapMod => {
    window.__megosztasMod = alapMod;
    window.__megosztasok = [];
    const canShare = d => {
      if (window.__megosztasMod === 'nincsFajl') return !(d && d.files && d.files.length);
      return !!d && (!d.files || d.files.every(f => f instanceof File));
    };
    const share = d => {
      const fajlok = (d && d.files ? d.files : []).map(f => ({ nev: f.name, tipus: f.type, meret: f.size }));
      window.__megosztasok.push({ title: d && d.title, text: d && d.text, url: d && d.url, fajlok, mod: window.__megosztasMod });
      const m = window.__megosztasMod;
      if (m === 'AbortError' || m === 'NotAllowedError') return Promise.reject(new DOMException('teszt: ' + m, m));
      return Promise.resolve();
    };
    for (const [k, v] of [['canShare', canShare], ['share', share]]) {
      try { Object.defineProperty(Navigator.prototype, k, { configurable: true, writable: true, value: v }); }
      catch (e) { try { Object.defineProperty(navigator, k, { configurable: true, value: v }); } catch (e2) { /* nincs */ } }
    }
  }, mod);
}
export const megosztasok = page => page.evaluate(() => window.__megosztasok || []);
export const megosztasMod = (page, mod) => page.evaluate(m => { window.__megosztasMod = m; }, mod);

/* ---------------------------------------------------------------- színek, kontraszt */
export function kontrasztFv() {
  // a böngészőben is használható forrás (page.evaluate-be fűzve)
  return `
    const szinParse = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const fenyesseg = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const kontraszt = (a, b) => { const x = fenyesseg(a), y = fenyesseg(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hatterSzin = e => { for (let p = e; p; p = p.parentElement) { const c = szinParse(getComputedStyle(p).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  `;
}

// a nyitott párbeszédablak: a nézetben van-e, és a tartalma aljára görgetve az utolsó elem a lábléc (gombsor) fölött látszik-e
export function dlgMeres(page) {
  return page.evaluate(() => {
    const d = document.querySelector('#dlg');
    const r = d.getBoundingClientRect();
    const t = d.querySelector('.dlg-tartalom'), lab = d.querySelector('.dlg-lab');
    if (t) t.scrollTop = t.scrollHeight;
    let utolsoAlja = null;
    if (t) for (const e of t.querySelectorAll('*')) { const x = e.getBoundingClientRect(); if (x.width > 0 && x.height > 0) utolsoAlja = Math.max(utolsoAlja == null ? -1e9 : utolsoAlja, x.bottom); }
    const lr = lab ? lab.getBoundingClientRect() : null;
    const k = n => Math.round(n * 10) / 10;
    return {
      teteje: k(r.top), alja: k(r.bottom), bal: k(r.left), jobb: k(r.right), vh: window.innerHeight, vw: document.documentElement.clientWidth,
      tartalomAlja: utolsoAlja == null ? null : k(utolsoAlja), labTeteje: lr ? k(lr.top) : null, labAlja: lr ? k(lr.bottom) : null,
      tartalomTeteje: t ? k(t.getBoundingClientRect().top) : null, tartalomAljaKeret: t ? k(t.getBoundingClientRect().bottom) : null
    };
  });
}

// a fókuszált elem helyzete a sávhoz és a (látható) nézethez képest
export function fokuszHelyzet(page) {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    const r = e.getBoundingClientRect();
    const sav = document.querySelector('#sav');
    const savTeteje = sav.hidden ? Infinity : sav.getBoundingClientRect().top;
    const vv = window.visualViewport;
    const lathatoAlja = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const k = n => Math.round(n * 10) / 10;
    return { elem: e.getAttribute('aria-label') || e.id || e.className, teteje: k(r.top), alja: k(r.bottom), savTeteje: k(savTeteje), lathatoAlja: k(lathatoAlja) };
  });
}
