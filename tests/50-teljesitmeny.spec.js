// Teljesítmény: a PDF-készítés ideje (Chromiumban 4× lassított CPU-n, WebKitben lassítás nélkül), a töltésjelzés,
// valamint a lapsúly (index.html, első betöltés, IndexedDB-gyorsítótár, PDF-méret, beágyazott betűk).
// A mérések: tests/kimenet/pdf/<projekt>/teljesitmeny_*.json és lapsuly.json; a konzolon „[mérés]” sorok.
import fs from 'node:fs';
import { test, expect, nyit, kesz, pdfKesz, sokTetel, pdfKozvetlen, KULCS } from './segito.js';
import { cpuLassit, median, mentFajl, pdfNyers, brotliMeret, gzipMeret, cdnMeret, path, ujraNyit, blobEnged, LASSU_PDFMAKE } from './segito-pdf.js';
import { cachePath, konyvtarak, GYOKER } from './cdn.js';

const IDO = '2026-10-10T09:00:00';
const LASSITAS = 4;

// mérőpontok az oldalon: a kattintás (esemény-időbélyeg), a kezelő, a gomb állapota, az első képkocka, a letöltés, a párbeszédablak
const MERO = () => {
  window.__m = null;
  const ide = e => e.composedPath().some(n => n && n.id === 'letoltGomb');
  document.addEventListener('click', e => {
    if (!ide(e)) return;
    const e0 = window.dentAl && window.dentAl.elokeszitett, a0 = window.dentAl && window.dentAl.pdfBemenet();
    window.__m = { input: e.timeStamp, kezelo: performance.now(), pdfmake: !!window.pdfMake, elokeszitve: !!(e0 && a0 && a0.ok && e0.kulcs === a0.b.kulcs) };
  }, true);
  document.addEventListener('click', e => {
    if (!ide(e) || !window.__m) return;
    const m = window.__m; const g = document.querySelector('#letoltGomb');
    m.busy = g.getAttribute('aria-busy'); m.porgo = !!g.querySelector('.porgo'); m.szoveg = g.textContent.trim();
    requestAnimationFrame(() => { m.festes = performance.now(); m.festesBusy = g.getAttribute('aria-busy'); });
  });
  const eredeti = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && window.__m && !window.__m.letoltes) window.__m.letoltes = performance.now();
    return eredeti.apply(this, arguments);
  };
  window.__hosszu = [];
  try { new PerformanceObserver(l => { for (const x of l.getEntries()) window.__hosszu.push(x.duration); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* csak Chromium */ }
  document.addEventListener('DOMContentLoaded', () => {
    const d = document.getElementById('dlg');
    if (d) new MutationObserver(() => { if (d.open && window.__m && !window.__m.dlg) window.__m.dlg = performance.now(); }).observe(d, { attributes: true, attributeFilter: ['open'] });
  });
};
// a háttérben előkészített PDF a mostani állapothoz tartozik
const elokeszitve = page => page.waitForFunction(() => {
  const a = window.dentAl.pdfBemenet(); const e = window.dentAl.elokeszitett;
  return a.ok && e && e.kulcs === a.b.kulcs;
}, null, { timeout: 120_000 });
// mennyiség-változás és kattintás egyetlen feladatban (a háttér-előkészítés 1,2 s-os késleltetése így biztosan nem fut le közben)
const VALTOZAS_ES_KATTINTAS = () => {
  const inp = document.querySelector('#tetelLista input.menny');
  inp.value = inp.value === '5' ? '6' : '5';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('#letoltGomb').click();
};
const KATTINTAS = () => document.querySelector('#letoltGomb').click();

// az alkalmazás IndexedDB-gyorsítótárának törlése (ugyanarról az eredetről, az alkalmazás nélkül)
async function gyorsitotarTorol(page) {
  await page.goto('/tests/pdfnezo.html');
  const ok = await page.evaluate(() => new Promise(r => {
    const q = indexedDB.deleteDatabase('dentAl-arlista');
    q.onsuccess = () => r(true); q.onerror = () => r(false);
    setTimeout(() => r(false), 15_000);        // ha egy előző (gyorsítótárazott) lap még fogja, a törlés a kapcsolat bezárásáig vár
  }));
  expect(ok, 'az IndexedDB-gyorsítótár törlése').toBe(true);
}

/* ======================================================================
   1. A PDF-készítés ideje: hideg / meleg / változás után, 15, 45 (a legtöbb, ami elfér) és 60 tétel (túlcsordul)
   ====================================================================== */
test.describe('PDF-készítés ideje', () => {
  test.describe.configure({ mode: 'serial' });
  for (const n of [15, 45, 60]) {
    test(`[mérés] ${n} tétel: a kattintástól a letöltésig (vagy a „nem fér el” ablakig) — hideg, meleg, változás után; 3 ismétlés, medián`, async ({ page, browserName, hibak }, testInfo) => {
      test.setTimeout(420_000);
      // a „hideg” méréshez a teszt a háttérletöltés közben elnavigál (az IndexedDB törlése miatt); a WebKit a megszakított
      // fetch-et „access control checks” konzolhibaként naplózza — ezt a teszt okozza, nem az alkalmazás
      hibak.enged(/Fetch API cannot load .* due to access control checks/);
      hibak.enged(/Cannot load blob:.* due to access control checks/);   // ugyanez a háttérben induló PDF-Workerrel (1.7.0)
      const adat = sokTetel(n);
      const menny = {}; adat.tetelek.forEach(t => { menny[t.id] = 1; });
      await page.addInitScript(MERO);
      await blobEnged(page);                           // WebKit: a valódi (blob:-os) szkriptbetöltési út, ne a tartalék
      await cpuLassit(page, browserName, LASSITAS);   // a navigálás előtt: a betöltés is lassított, és az újratöltések után is megmarad
      await nyit(page, { adat, valasztas: { orvosId: 'o1', menny, datum: null }, beall: { nullazas: false }, ido: IDO });
      const futasok = [];
      const egy = async (mod, ism) => {
        if (mod === 'hideg') await gyorsitotarTorol(page);
        await page.goto('/index.html'); await kesz(page);
        let hosszuElotte = [];
        if (mod !== 'hideg') { await pdfKesz(page); await elokeszitve(page); hosszuElotte = await page.evaluate(() => window.__hosszu.slice()); }
        const vart = n <= 45 ? page.waitForEvent('download', { timeout: 120_000 }) : page.locator('#dlg[open]').waitFor({ timeout: 120_000 });
        await page.evaluate(mod === 'valtozas' ? VALTOZAS_ES_KATTINTAS : KATTINTAS);
        await vart;
        await expect.poll(() => page.evaluate(() => !!(window.__m && window.__m.festes))).toBe(true);
        const m = await page.evaluate(() => window.__m);
        const veg = n <= 45 ? m.letoltes : m.dlg;
        expect(veg, n <= 45 ? 'letöltés indult' : 'a „nem fér el” ablak megnyílt').toBeTruthy();
        const f = { mod, ism, ido: Math.round(veg - m.input), elsoKepkocka: Math.round(m.festes - m.input), busy: m.busy, porgo: m.porgo, szoveg: m.szoveg,
          festesBusy: m.festesBusy, pdfmakeKattintaskor: m.pdfmake, elokeszitveKattintaskor: m.elokeszitve, leghosszabbFeladatElotte: hosszuElotte.length ? Math.round(Math.max(...hosszuElotte)) : null };
        futasok.push(f);
        if (n > 45) await page.locator('#dlg').getByRole('button', { name: 'Rendben' }).click();
        // robusztus elvárások: a meleg (előkészített) út gyors; ami 2 s-nál tovább tart, annál a gombon töltésjelzés van
        if (mod === 'meleg') expect(f.ido, 'előkészített PDF: azonnal').toBeLessThan(1500);
        if (f.ido > 2000) {
          expect(f.busy, `${mod}: ${f.ido} ms — a gomb aria-busy="true"`).toBe('true');
          expect(f.porgo, 'pörgő a gombon').toBe(true);
          expect(f.szoveg).toContain('PDF készül');
        }
        expect(f.ido).toBeLessThan(60_000);
      };
      for (let ism = 1; ism <= 3; ism++) for (const mod of ['hideg', 'meleg', 'valtozas']) await egy(mod, ism);
      const osszegzes = {};
      for (const mod of ['hideg', 'meleg', 'valtozas']) {
        // „hideg”: csak azok a futások, ahol a kattintáskor még nem volt kész a PDF (a pdfmake sem töltődött be)
        const f = futasok.filter(x => x.mod === mod && (mod !== 'hideg' || !x.elokeszitveKattintaskor));
        osszegzes[mod] = { median: median(f.map(x => x.ido)), elsoKepkockaMedian: median(f.map(x => x.elsoKepkocka)), futasok: f.map(x => x.ido) };
      }
      const eredmeny = { projekt: testInfo.project.name, n, cpuLassitas: browserName === 'chromium' ? LASSITAS : 1, osszegzes, futasok };
      mentFajl(testInfo, `teljesitmeny_${n}.json`, JSON.stringify(eredmeny, null, 2));
      testInfo.annotations.push({ type: 'mérés', description: JSON.stringify(osszegzes) });
      console.log(`[mérés] ${testInfo.project.name} ${n} tétel (CPU ×${eredmeny.cpuLassitas}): ` +
        Object.entries(osszegzes).map(([k, v]) => `${k} medián ${v.median} ms (első képkocka ${v.elsoKepkockaMedian} ms; ${v.futasok.join('/')})`).join(' · '));
    });
  }
});

/* ======================================================================
   2. Töltésjelzés: kirajzolódik-e, amíg a PDF készül
   ====================================================================== */
test('[TEL-01] lassú processzoron a „PDF készül…” jelzés a kattintás után azonnal kirajzolódik, nem csak a PDF elkészülte után', async ({ page }) => {
  test.setTimeout(120_000);
  const adat = sokTetel(15);
  const menny = {}; adat.tetelek.forEach(t => { menny[t.id] = 1; });
  await page.addInitScript(MERO);
  await blobEnged(page);
  await nyit(page, { adat, valasztas: { orvosId: 'o1', menny, datum: null }, beall: { nullazas: false }, ido: IDO });
  await pdfKesz(page); await elokeszitve(page);
  // lassú telefon szimulálása minden motorban: a pdfmake minden oldalszámítása 1,5 s-ig foglalja a fő szálat
  // (4× lassított CPU-n a valódi érték 45 tételnél 1,3–2,4 s, lásd a [mérés] tesztet); Workeres PDF-nél nincs mit lassítani
  await page.evaluate(LASSU_PDFMAKE);
  const dl = page.waitForEvent('download', { timeout: 60_000 });
  await page.evaluate(VALTOZAS_ES_KATTINTAS);
  await dl;
  await expect.poll(() => page.evaluate(() => !!(window.__m && window.__m.festes))).toBe(true);
  const m = await page.evaluate(() => window.__m);
  expect(m.busy, 'a gomb a kattintáskor aria-busy="true"').toBe('true');
  expect(m.porgo).toBe(true);
  if (await page.evaluate(() => window.__lassitasDb > 0)) expect(m.letoltes - m.input, 'a PDF-készítés valóban lassú volt').toBeGreaterThan(1400);
  expect(Math.round(m.festes - m.input), 'a kattintás után az első képkocka (benne a pörgővel) ennyi ms múlva rajzolódik ki').toBeLessThan(400);
  expect(m.festesBusy, 'az első képkockán már látszik a töltésjelzés').toBe('true');
});

// Az ellenőrzés kiegészítése: ugyanez az Előnézet útján — a párbeszédablak („Előnézet készül…”) is csak a PDF első
// oldalszámítása után rajzolódik ki, addig a koppintásra semmi nem történik.
test('[TEL-01] lassú processzoron az Előnézet ablaka („Előnézet készül…”) a koppintás után azonnal kirajzolódik', async ({ page }) => {
  test.setTimeout(120_000);
  const adat = sokTetel(15);
  const menny = {}; adat.tetelek.forEach(t => { menny[t.id] = 1; });
  await page.addInitScript(() => {
    const ide = e => e.composedPath().some(n => n && n.id === 'elonezetGomb');
    document.addEventListener('click', e => { if (ide(e)) window.__e = { input: e.timeStamp }; }, true);
    document.addEventListener('click', e => {
      if (!ide(e) || !window.__e) return;
      const m = window.__e;
      requestAnimationFrame(() => {
        const d = document.getElementById('dlg');
        m.festes = performance.now(); m.nyitva = !!(d && d.open); m.szoveg = d ? d.textContent : '';
      });
    });
  });
  await blobEnged(page);
  await nyit(page, { adat, valasztas: { orvosId: 'o1', menny, datum: null }, beall: { nullazas: false }, ido: IDO });
  await pdfKesz(page); await elokeszitve(page);
  await page.evaluate(LASSU_PDFMAKE);
  await page.evaluate(() => {
    const inp = document.querySelector('#tetelLista input.menny');
    inp.value = inp.value === '5' ? '6' : '5';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#elonezetGomb').click();
  });
  await expect(page.locator('#dlg canvas'), 'az előnézet végül elkészül').toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => !!(window.__e && window.__e.festes))).toBe(true);
  const m = await page.evaluate(() => window.__e);
  if (await page.evaluate(() => window.__lassitasDb > 0)) expect(await page.evaluate(() => performance.now()) - m.input, 'a PDF-készítés valóban lassú volt').toBeGreaterThan(1400);
  expect(m.nyitva, 'az első képkockán az ablak már nyitva van').toBe(true);
  expect(m.szoveg, 'és az „Előnézet készül…” felirat látszik').toContain('Előnézet készül');
  expect(Math.round(m.festes - m.input), 'a koppintás után az első képkocka ennyi ms múlva rajzolódik ki').toBeLessThan(400);
});

test('[TEL-03] a háttérbeli PDF-előkészítés nem fagyasztja le a felületet: a fő szál közben sem foglalt 0,5 s-nál tovább', async ({ page }) => {
  test.setTimeout(120_000);
  const adat = sokTetel(15);
  const menny = {}; adat.tetelek.forEach(t => { menny[t.id] = 1; });
  await blobEnged(page);                 // WebKit: egy blob:-os Web Worker (a javítás) a közös elfogó miatt el sem indulna
  await nyit(page, { adat, valasztas: { orvosId: 'o1', menny, datum: null }, ido: IDO });
  await pdfKesz(page); await elokeszitve(page);
  // lassú telefon szimulálása: egy pdfmake-oldalszámítás 1,5 s (4× lassított CPU-n a valódi érték 15–45 tételnél 1,3–2,2 s
  // oldalszámításonként, lásd a [mérés] tesztet); ha a PDF Web Workerben készül, a fő szálon nincs mit lassítani
  await page.evaluate(LASSU_PDFMAKE);
  await page.evaluate(() => {
    // szívverés: 20 ms-onként egy időzítő; a legnagyobb kihagyás = a fő szál leghosszabb foglaltsága
    window.__sziv = { max: 0, fut: true };
    let utolso = performance.now();
    const tick = () => { const most = performance.now(); window.__sziv.max = Math.max(window.__sziv.max, most - utolso); utolso = most; if (window.__sziv.fut) setTimeout(tick, 20); };
    setTimeout(tick, 20);
    // mennyiség-változás: a háttérben (1,2 s múlva) új PDF készül
    const inp = document.querySelector('#tetelLista input.menny');
    inp.value = '3'; inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await elokeszitve(page);
  const max = await page.evaluate(() => { window.__sziv.fut = false; return Math.round(window.__sziv.max); });
  expect(max, `a fő szál leghosszabb foglaltsága a háttér-előkészítés alatt: ${max} ms (közben a koppintás, görgetés, gépelés nem reagál)`).toBeLessThan(500);
});

test('[TEL-02] az Előnézet ablak „PDF letöltése” gombja után is látszik, hogy a PDF készül', async ({ page, context }) => {
  test.setTimeout(120_000);
  // első használat lassú hálózaton: a pdfmake letöltése addig késik, amíg a teszt el nem engedi
  let elenged; const kapu = new Promise(r => { elenged = r; });
  await page.route(/\/npm\/pdfmake@[^/]+\/build\/pdfmake\.min\.js/, async route => {
    await kapu;
    await route.fulfill({ status: 200, body: fs.readFileSync(cachePath(route.request().url())),
      headers: { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
  });
  const adat = sokTetel(15);
  const menny = {}; adat.tetelek.forEach(t => { menny[t.id] = 1; });
  await blobEnged(page);
  await nyit(page, { adat, valasztas: { orvosId: 'o1', menny, datum: null }, ido: IDO });
  await page.locator('#elonezetGomb').click();
  const dlg = page.locator('#dlg');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Előnézet készül');
  await dlg.getByRole('button', { name: 'PDF letöltése' }).click();
  await expect(dlg).toBeHidden();
  const letoltes = page.waitForEvent('download', { timeout: 60_000 }).catch(e => e);
  try {
    // amíg a PDF készül, valahol látszania kell a töltésjelzésnek (a sáv gombján vagy üzenetben)
    await expect(page.locator('[aria-busy="true"]:visible, .porgo:visible').first(), 'látható töltésjelzés, amíg a PDF készül').toBeVisible({ timeout: 3000 });
  } finally { elenged(); }
  const d = await letoltes;
  expect(d instanceof Error ? String(d) : d.suggestedFilename(), 'a letöltés végül elindul').toMatch(/\.pdf$/);
});

// Az ellenőrzés új lelete: a PDF után a „kész” panel a „PDF letöltése” gomb helyére kerül, és telefonon pont a gomb közepén
// a „Mennyiségek vissza”, asztalon az „Új árlista” áll. A szokásos esetben (a PDF már előkészült) egy dupla — vagy türelmetlen
// második — koppintás így visszahozza az épp nullázott mennyiségeket és bezárja a panelt (asztalon csak bezárja).
test('[PDF-E1] dupla koppintás a „PDF letöltése” gombon: egy letöltés, a „Letöltve” panel marad, a mennyiségek nullázva maradnak (a második koppintás nem nyomja meg a helyére kerülő gombot)', async ({ page }, testInfo) => {
  const adat = sokTetel(3);
  await nyit(page, { adat, valasztas: { orvosId: 'o1', menny: { t1: 2, t2: 1 }, datum: null }, ido: IDO });
  await pdfKesz(page); await elokeszitve(page);
  const letoltesek = []; page.on('download', d => letoltesek.push(d.suggestedFilename()));
  const b = await page.locator('#letoltGomb').boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const koppint = () => (testInfo.project.use.hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  await koppint();
  await page.waitForTimeout(120);                     // a dupla koppintás második fele: 120 ms múlva, ugyanoda
  await koppint();
  await expect.poll(() => letoltesek.length, 'pontosan egy letöltés').toBe(1);
  await expect(page.locator('#savKesz'), 'a „Letöltve” panel látszik marad').toBeVisible();
  await expect(page.locator('#keszCim')).toContainText('Letöltve');
  await expect(page.locator('#osszeg'), 'a mennyiségek nullázva maradnak').toHaveText('Még nincs kiválasztott tétel');
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).menny, KULCS.valasztas), 'a tárolt mennyiségek is').toEqual({});
  await expect(page.locator('#uzenetek')).not.toContainText('A mennyiségek visszaálltak');
});

/* ======================================================================
   3. Lapsúly: index.html, első betöltés, IndexedDB, PDF-méret és betűk
   ====================================================================== */
test('[mérés] lapsúly: index.html, az első betöltés letöltései, az IndexedDB-gyorsítótár, a PDF-ek és a beágyazott betűk mérete', async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  const keresek = [];
  page.on('requestfinished', req => keresek.push((async () => {
    const res = await req.response();
    let meret = null; try { meret = (await res.body()).length; } catch (e) { /* nincs törzs */ }
    return { url: req.url(), meret };
  })()));
  const adat = sokTetel(45);
  const menny = {}; adat.tetelek.forEach(t => { menny[t.id] = 1; });
  await nyit(page, { adat, valasztas: { orvosId: 'o1', menny, datum: null }, ido: IDO });
  await pdfKesz(page);
  await elokeszitve(page);
  const letoltve = (await Promise.all(keresek)).filter(k => /^https?:/.test(k.url));
  const halozatonMert = letoltve.reduce((a, k) => a + (k.meret || 0), 0);   // tájékoztató: a WebKit a késői válaszokat nem mindig adja vissza

  // az index.html és összetevői
  const html = fs.readFileSync(path.join(GYOKER, 'index.html'));
  const s = html.toString('utf8');
  const bajt = x => Buffer.byteLength(x, 'utf8');
  const reszek = {
    szkript: [...s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].reduce((a, m) => a + bajt(m[1]), 0),
    stilus: [...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].reduce((a, m) => a + bajt(m[1]), 0),
    logoSablonok: [...s.matchAll(/<template id="logo-[a-z]+">[\s\S]*?<\/template>/g)].reduce((a, m) => a + bajt(m[0]), 0),
    dataUrl: [...s.matchAll(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g)].reduce((a, m) => a + bajt(m[0]), 0)
  };
  // az IndexedDB-gyorsítótár
  const idb = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('dentAl-arlista');
    r.onsuccess = () => {
      const d = r.result; const tx = d.transaction('fajlok', 'readonly'); const st = tx.objectStore('fajlok');
      const kulcsok = st.getAllKeys(); const ertekek = st.getAll();
      tx.oncomplete = () => { const t = {}; ertekek.result.forEach((v, i) => { t[String(kulcsok.result[i])] = v && v.bajtok ? v.bajtok.byteLength : 0; }); d.close(); res(t); };
    };
    r.onerror = () => res(null);
  }));
  const idbOsszes = idb ? Object.values(idb).reduce((a, x) => a + x, 0) : 0;
  const becsles = await page.evaluate(async () => { try { return (await navigator.storage.estimate()).usage; } catch (e) { return null; } });
  // a CDN-könyvtárak: nyers és tömörített (a CDN gzip/brotli átvitelének becslése)
  const cdn = konyvtarak().map(k => {
    const h = cachePath(k.url); const b = fs.existsSync(h) ? fs.readFileSync(h) : null;
    return { url: k.url.replace(/^https:\/\//, ''), nyers: b ? b.length : null, gzip: b ? gzipMeret(b) : null, brotli: b ? brotliMeret(b) : null, letoltve: letoltve.some(x => x.url === k.url) };
  });
  // PDF-méretek 1, 15 és 45 tétellel; a beágyazott betűk
  const pdfek = {};
  for (const k of [1, 15, 45]) {
    const a = sokTetel(k); const m = {}; a.tetelek.forEach(t => { m[t.id] = 1; });
    await ujraNyit(page, { adat: a, valasztas: { orvosId: 'o1', menny: m, datum: null } });
    const r = await pdfKozvetlen(page);
    const b = Buffer.from(r.b64, 'base64');
    expect(r.tulcsordul).toBe(false);
    const ny = pdfNyers(b);
    pdfek[k] = { meret: b.length, betuk: ny.betuk.map(x => ({ nev: x.nev, reszhalmaz: x.reszhalmaz, beagyazottFajl: x.fajlMeret, kibontva: x.fajlMeretKibontva, jelek: x.unicode ? x.unicode.size : null })) };
  }
  const teljesBetu = konyvtarak().filter(x => /IBMPlexSans-(Regular|SemiBold)\.ttf$/.test(x.url)).map(x => cdnMeret(x.url));

  // az első betöltés (tömörítetlenül): az index.html + minden könyvtár, amit az alkalmazás az első megnyitáskor letölt és elment
  const elsoBetoltes = html.length + idbOsszes;
  const eredmeny = {
    projekt: testInfo.project.name,
    indexHtml: { bajt: html.length, gzip: gzipMeret(html), brotli: brotliMeret(html), reszek },
    elsoBetoltes: { bajt: elsoBetoltes, halozatonMert, keresek: letoltve.length, reszletek: letoltve.map(k => ({ url: k.url.replace(/^https?:\/\//, ''), meret: k.meret })) },
    cdn, cdnOsszesen: { nyers: cdn.filter(x => x.letoltve).reduce((a, x) => a + x.nyers, 0), brotli: cdn.filter(x => x.letoltve).reduce((a, x) => a + x.brotli, 0) },
    indexedDB: idb ? { bajt: idbOsszes, elemek: idb } : null,
    tarhelyBecsles: becsles,
    pdf: pdfek, teljesBetuFajl: teljesBetu,
    // a WebKit a blob: címek betöltését is a hálózati elfogón vezeti át (a közös tesztkeret ezeket is naplózza), ezért csak a http(s) számít
    kulsoKeresek: context.kulsoKeresek.filter(u => /^https?:/.test(u))
  };
  mentFajl(testInfo, 'lapsuly.json', JSON.stringify(eredmeny, null, 2));
  console.log(`[mérés] ${testInfo.project.name} lapsúly: index.html ${html.length} B (brotli ${eredmeny.indexHtml.brotli} B; szkript ${reszek.szkript}, stílus ${reszek.stilus}, logók ${reszek.logoSablonok}, data-URL ${reszek.dataUrl}); ` +
    `első betöltés ${elsoBetoltes} B ${letoltve.length} kérésben (a CDN-részt a CDN tömörítve küldi: ~${eredmeny.cdnOsszesen.brotli} B brotli); IndexedDB ${eredmeny.indexedDB && eredmeny.indexedDB.bajt} B; ` +
    `PDF 1/15/45 tétel: ${pdfek[1].meret}/${pdfek[15].meret}/${pdfek[45].meret} B; beágyazott betűk (45 tétel): ${pdfek[45].betuk.map(x => `${x.nev} ${x.beagyazottFajl} B`).join(', ')} (a teljes TTF: ${teljesBetu.join(' / ')} B)`);

  // robusztus felső korlátok
  expect(html.length, 'az index.html mérete').toBeLessThan(450_000);
  expect(elsoBetoltes, 'az első betöltés összesen (tömörítetlenül)').toBeLessThan(6_000_000);
  if (eredmeny.indexedDB) expect(eredmeny.indexedDB.bajt, 'az IndexedDB-gyorsítótár').toBeLessThan(6_000_000);
  expect(pdfek[1].meret).toBeLessThan(40_000);
  expect(pdfek[45].meret, 'a legnagyobb (45 tételes) PDF').toBeLessThan(80_000);
  for (const k of [1, 15, 45]) for (const b of pdfek[k].betuk) {
    expect(b.reszhalmaz, `${b.nev}: részhalmaz`).toBe(true);
    expect(b.beagyazottFajl, `${b.nev}: a beágyazott betűfájl csak a szükséges jeleket tartalmazza`).toBeLessThan(40_000);
  }
  expect(eredmeny.kulsoKeresek, 'nincs más külső kérés (a CDN-en kívül)').toEqual([]);
});
