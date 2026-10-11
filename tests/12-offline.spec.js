// CDN és offline működés: rögzített verziók és SRI, elérhetetlen / hibás / meghamisított / akadozó CDN,
// későbbi indítás internet nélkül (IndexedDB-ből, illetve a service workerrel a gyorsítótárból).
// A hibát feltáró tesztek a HELYES viselkedést várják (most pirosak); a címükben a hiba azonosítója áll.
import fs from 'node:fs';
import path from 'node:path';
import {
  test, expect, nyit, kesz, adatok, valasztas, orvosValaszt, mennyBeir, letoltes, pdfOldalSzam, pdfKozvetlen
} from './segito.js';
import { konyvtarak, cachePath, sriJo, CDN_MINTA, GYOKER } from './cdn.js';
import {
  olvasFajl, SZKRIPT_UT, FEJ_UT, SW_UT, xlsxKeszit, offlineKesz, idbIr, KONYVTAR, sajatSzerver, arakNezet, jsonBuffer, mentesJson
} from './segito-biztonsag.js';

const IDO = '2026-10-10T09:00:00';
const XLSX_TIPUS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// a CDN elérhetetlensége miatt a böngésző maga ír a konzolra (nem az alkalmazás)
const HALOZATI_KONZOL = /Failed to load resource|Fetch API cannot load|access control checks|ERR_BLOCKED_BY_CLIENT|ERR_FAILED|Load failed/;
const hibaUzenet = page => page.locator('#uzenetek .uzenet.hiba');
const MINTA_EXCEL = { 'Adatbázis': [['', 'Peti', 'Dani'], ['Korona', 1000, 2000], ['Ínymaszk', 300, 400]] };

async function alapNyitas(page, opciok = {}) {
  const a = adatok();
  await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 2 } }), ido: IDO, ...opciok });
}
function cdnKeresek(page) {
  const r = [];
  page.on('request', q => { if (CDN_MINTA.test(q.url())) r.push(q.url()); });
  return r;
}

/* ======================================================================
   Statikus ellenőrzés: rögzített verziók, SRI, CSP, service worker
   ====================================================================== */
test.describe('statikus ellenőrzés', () => {
  const src = olvasFajl(SZKRIPT_UT);

  test('minden CDN-könyvtár rögzített verzióval és sha384 SRI-vel szerepel, és a letöltött fájl megfelel neki', () => {
    const k = konyvtarak();
    expect(k.length, 'CDN-ről töltött könyvtárak').toBeGreaterThanOrEqual(6);
    for (const { url, sri } of k) {
      expect(url, 'https').toMatch(/^https:\/\//);
      expect(url, 'pontos verzió (x.y.z) a címben').toMatch(/(@v?|\/)\d+\.\d+\.\d+\//);
      expect(url, 'nincs „latest” vagy verziótartomány').not.toMatch(/@latest|@\^|@~|@\d+\/|@\d+\.\d+\//);
      expect(sri, url).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
      expect(sriJo(fs.readFileSync(cachePath(url)), sri), `SRI egyezik: ${url}`).toBe(true);
    }
    // a PDF-hez, előnézethez, Excel-importhoz szükséges könyvtárak offline-ra is elmentődnek
    const offline = [...src.matchAll(/(\w+): \{(?:\s*\/\/[^\n]*)?\s*url: '[^']+',\s*sri: '[^']+',[^}]*?offline: (true|false)/g)].map(m => [m[1], m[2]]);
    expect(Object.fromEntries(offline)).toEqual({ pdfmake: 'true', plexReg: 'true', plexSemi: 'true', xlsx: 'true', pdfjs: 'true', pdfjsWorker: 'true', roboto: 'false' });
  });

  test('a CSP csak a használt CDN-eket (és a GitHub API-t) engedi; külső <script src> nincs; a könyvtárak SRI-ellenőrzés után futnak', () => {
    const fej = olvasFajl(FEJ_UT);
    const csp = fej.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    const connect = csp.match(/connect-src ([^;]+)/)[1].trim().split(/\s+/);
    expect(connect).toEqual(["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://api.github.com']);
    for (const { url } of konyvtarak()) expect(connect, url).toContain(new URL(url).origin);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'none'/);
    const html = fs.readFileSync(path.join(GYOKER, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=["']?https?:/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet[^>]+href=["']?https?:/i);
    // a letöltés útja: bajtok() → SRI-ellenőrzés (a tárolt példányé is) → csak utána fut
    expect(src).toMatch(/if \(await sriRendben\(tarolt\.bajtok, k\.sri\)\) return tarolt\.bajtok;/);
    expect(src).toMatch(/if \(!\(await sriRendben\(buf, k\.sri\)\)\) throw new AppHiba/);
  });

  test('[BIZ-03] az SRI-ellenőrzés ismeretlen algoritmusnál elutasít (nem enged át ellenőrzés nélkül)', () => {
    // sriRendben(): „if (!nev) return true;” — egy elírt SRI (pl. „sha385-…”) csendben kikapcsolná az ellenőrzést.
    const fv = src.slice(src.indexOf('async function sriRendben'), src.indexOf('const letoltesFolyamatban'));
    expect(fv).toContain('sha384');
    expect(fv, 'ismeretlen algoritmusnál true-val tér vissza').not.toMatch(/if \(!nev\) return true;/);
  });

  test('service worker: csak az alkalmazás oldalát szolgálja ki a gyorsítótárból, hálózat-először, időkorláttal; a CDN-t nem tárolja', () => {
    const sw = olvasFajl(SW_UT);
    expect(sw).toMatch(/if \(url\.origin !== self\.location\.origin\) return;/);
    expect(sw).toMatch(/if \(rel !== '' && rel !== 'index\.html'\) return;/);
    const ms = Number((sw.match(/const VARAKOZAS_MS = (\d+);/) || [])[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
    expect(sw).toMatch(/includes\('text\/html'\)/);
  });
});

/* ======================================================================
   A könyvtárak futtatása: blob:-szkript (a CSP engedi), nem a beágyazott tartalék
   ====================================================================== */
test('a letöltött könyvtárak blob:-szkriptként futnak (a CSP engedi), a beágyazott (inline) tartalék nem kell, a PDF Web Workerben készül — mindkét motorban', async ({ page }) => {
  // A közös keret context.route-ja WebKitben a blob: címet is külső kérésnek veszi és elvágja (Chromiumban a blob:
  // nem megy át a route-on), ezért WebKitben az alkalmazás a többi tesztben mindig a beágyazott tartalékkal fut.
  // Itt a blob:-t átengedjük, és a valódi utat nézzük: ez őrzi, hogy egy CSP-szigorítás (BIZ-02) ne törje el a betöltést.
  await page.route(u => u.protocol === 'blob:', r => r.continue());
  await page.addInitScript(() => {
    window.__szkriptek = [];
    const eredeti = Element.prototype.appendChild;
    Element.prototype.appendChild = function (n) {
      if (n && n.tagName === 'SCRIPT') {
        if (n.src) {
          const s = n.src.slice(0, 5);
          n.addEventListener('load', () => window.__szkriptek.push('betöltve ' + s));
          n.addEventListener('error', () => window.__szkriptek.push('hiba ' + s));
        } else window.__szkriptek.push('beágyazott tartalék');
      }
      return eredeti.call(this, n);
    };
  });
  await alapNyitas(page);
  const k = await pdfKozvetlen(page);
  expect(k && k.oldalak).toBe(1);
  // 1.7.0 óta a pdfmake egy blob:-os Web Workerben fut (TEL-03), a fő szálon nincs pdfMake; az előnézet pdf.js-e
  // viszont a fő szálon, blob:-szkriptként töltődik — ezt nyitjuk meg
  expect(await page.evaluate(() => typeof window.pdfMake), 'a PDF a háttérszálon (Web Workerben) készül').toBe('undefined');
  await page.locator('#elonezetGomb').click();
  await expect(page.locator('#dlg canvas')).toBeVisible({ timeout: 30_000 });
  const sz = await page.evaluate(() => window.__szkriptek);
  expect(sz, 'a pdf.js blob:-szkriptként betöltődött').toContain('betöltve blob:');
  expect(sz.filter(x => x !== 'betöltve blob:'), 'hibás blob:-betöltés vagy beágyazott tartalék').toEqual([]);
});

/* ======================================================================
   A CDN nem érhető el (első indítás internet nélkül)
   ====================================================================== */
test.describe('CDN nélkül, első indításkor', () => {
  test('PDF letöltése: érthető magyar üzenet, nincs letöltés, a gomb újra használható', async ({ page, context, hibak }) => {
    hibak.enged(HALOZATI_KONZOL);
    context.cdnTiltva = true;
    await alapNyitas(page);
    let letoltve = 0; page.on('download', () => letoltve++);
    await page.locator('#letoltGomb').click();
    await expect(hibaUzenet(page)).toContainText('Még nincs letöltve erre az eszközre: a PDF-készítő (pdfmake). Csatlakozz az internethez, és próbáld újra; utána offline is működik.');
    await expect(page.locator('#letoltGomb')).toBeEnabled();
    await expect(page.locator('#letoltGomb')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#letoltGomb')).toContainText('PDF letöltése');
    await page.waitForTimeout(500);
    expect(letoltve).toBe(0);
  });

  test('Előnézet, Excel-import és az Árak lap offline-állapota: érthető üzenetek; a JSON-visszatöltés működik', async ({ page, context, hibak }) => {
    hibak.enged(HALOZATI_KONZOL);
    const excel = await xlsxKeszit(context, MINTA_EXCEL);
    context.cdnTiltva = true;
    await alapNyitas(page);
    await page.locator('#elonezetGomb').click();
    await expect(page.locator('#dlg .hibadoboz, #dlg .figyelmeztetes')).toContainText('Még nincs letöltve erre az eszközre: a PDF-készítő (pdfmake).');
    await page.locator('#dlg .dlg-zar').click();
    await arakNezet(page);
    await expect(page.locator('#offlineAllapot')).toContainText('Még letöltésre vár: a PDF-készítő (pdfmake)');
    // Ha az Excel-olvasó a CDN-ről jön (ma: cdnjs), az is hiányzik; ha az alkalmazás saját tárhelyről tölti
    // (pl. egy SheetJS-frissítés után), akkor CDN nélkül is működik az import.
    const xlsxCdnrol = konyvtarak().some(k => /\/xlsx(\.full)?(\.min)?\.js$/.test(k.url) || /\/xlsx\//.test(k.url));
    if (xlsxCdnrol) await expect(page.locator('#offlineAllapot')).toContainText('az Excel-olvasó (SheetJS)');
    await page.locator('#excelFajl').setInputFiles({ name: 'arak.xlsx', mimeType: XLSX_TIPUS, buffer: excel });
    if (xlsxCdnrol) {
      await expect(page.locator('#dlg #dlgCim')).toHaveText('Az Excel-fájl nem tölthető be', { timeout: 30_000 });
      await expect(page.locator('#dlg #dlgLeiras')).toContainText('Még nincs letöltve erre az eszközre: az Excel-olvasó (SheetJS).');
      await page.locator('#dlg .dlg-lab button').click();
    } else {
      await expect(page.locator('#dlg #dlgCim')).toHaveText('Excel-import előnézete', { timeout: 30_000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('#dlg[open]')).toHaveCount(0);
    }
    // a JSON-mentés visszatöltéséhez nem kell külső könyvtár
    await page.locator('#jsonFajl').setInputFiles({ name: 'm.json', mimeType: 'application/json', buffer: jsonBuffer(mentesJson({ orvosok: ['Kiss'], tetelek: [{ nev: 'Korona', arak: { Kiss: 5000 } }] })) });
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Mentés visszatöltése');
  });

  test('ha a CDN újra elérhető, újratöltés nélkül, a gomb újbóli megnyomására elkészül a PDF', async ({ page, context, hibak }) => {
    hibak.enged(HALOZATI_KONZOL);
    context.cdnTiltva = true;
    await alapNyitas(page);
    await page.locator('#letoltGomb').click();
    await expect(hibaUzenet(page)).toContainText('Még nincs letöltve');
    context.cdnTiltva = false;
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
    expect(pdfOldalSzam(bajtok)).toBe(1);
  });

  test('a CDN hibakóddal válaszol (HTTP 503): érthető üzenet', async ({ page, hibak }) => {
    hibak.enged(HALOZATI_KONZOL);
    await page.route(KONYVTAR('pdfmake.min.js').url, r => r.fulfill({ status: 503, body: 'nem elérhető', headers: { 'access-control-allow-origin': '*' } }));
    await alapNyitas(page);
    await page.locator('#letoltGomb').click();
    await expect(hibaUzenet(page)).toContainText('Nem sikerült letölteni: a PDF-készítő (pdfmake) (HTTP 503). Próbáld újra később.');
  });

  test('[OFF-01] akadozó hálózat (a CDN nem válaszol): a PDF-gomb ésszerű időn belül hibát jelez, nem pörög a végtelenségig', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(KONYVTAR('pdfmake.min.js').url, () => { /* soha nem válaszol */ });
    await alapNyitas(page);
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#letoltGomb')).toHaveAttribute('aria-busy', 'true');
    await expect(hibaUzenet(page), '60 mp alatt sincs hibaüzenet: a gomb a végtelenségig „PDF készül…”').toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#letoltGomb')).toBeEnabled();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});

/* ======================================================================
   Sérült vagy meghamisított könyvtár (SRI)
   ====================================================================== */
test.describe('SRI', () => {
  test('a CDN meghamisított fájlt küld: nem futtatja, érthetően szól, nincs letöltés, nem menti el', async ({ page }) => {
    await page.route(KONYVTAR('pdfmake.min.js').url, r => r.fulfill({
      status: 200, body: 'window.__hamis = 1; window.pdfMake = { createPdf() { window.__hamis = 2; } };',
      headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }
    }));
    await alapNyitas(page);
    let letoltve = 0; page.on('download', () => letoltve++);
    await page.locator('#letoltGomb').click();
    await expect(hibaUzenet(page)).toContainText('A letöltött fájl (a PDF-készítő (pdfmake)) nem egyezik a várt ellenőrzőösszeggel, ezért nem használom.');
    expect(await page.evaluate(() => window.__hamis)).toBeUndefined();
    expect(letoltve).toBe(0);
    const allapot = await page.evaluate(() => window.dentAl.offlineAllapot());
    expect(allapot.hianyzik).toContain('a PDF-készítő (pdfmake)');
  });

  test('meghamisított példány az offline-tárban (IndexedDB): eldobja, internet nélkül szól, internettel újra letölti; a hamis kód nem fut', async ({ page, context, hibak }) => {
    hibak.enged(HALOZATI_KONZOL);
    await alapNyitas(page);
    await offlineKesz(page);
    const url = KONYVTAR('pdfmake.min.js').url;
    await idbIr(page, url, 'window.__hamis = 1; window.pdfMake = { createPdf() { window.__hamis = 2; } };');
    context.cdnTiltva = true;
    await page.reload(); await kesz(page);
    await page.locator('#letoltGomb').click();
    await expect(hibaUzenet(page)).toContainText('Még nincs letöltve erre az eszközre: a PDF-készítő (pdfmake).');
    expect(await page.evaluate(() => window.__hamis)).toBeUndefined();
    context.cdnTiltva = false;
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
    expect(pdfOldalSzam(bajtok)).toBe(1);
    expect(await page.evaluate(() => window.__hamis)).toBeUndefined();
    await offlineKesz(page);
  });
});

/* ======================================================================
   Későbbi indítás internet nélkül
   ====================================================================== */
test.describe('későbbi indítás internet nélkül', () => {
  test('service worker nélkül, a CDN elérhetetlen: a PDF, az előnézet és az Excel-import az offline-tárból működik, CDN-kérés nélkül', async ({ page, context }) => {
    test.setTimeout(120_000);
    const excel = await xlsxKeszit(context, MINTA_EXCEL);
    await alapNyitas(page);
    await offlineKesz(page);
    context.cdnTiltva = true;
    const cdn = cdnKeresek(page);
    await page.reload(); await kesz(page);
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
    expect(pdfOldalSzam(bajtok)).toBe(1);
    await page.locator('#keszVisszaGomb').click();
    await page.locator('#elonezetGomb').click();
    await expect(page.locator('#dlg canvas')).toBeVisible({ timeout: 60_000 });
    await page.locator('#dlg .dlg-zar').click();
    await arakNezet(page);
    await expect(page.locator('#offlineAllapot')).toContainText('Offline használatra kész');
    await page.locator('#excelFajl').setInputFiles({ name: 'arak.xlsx', mimeType: XLSX_TIPUS, buffer: excel });
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Excel-import előnézete', { timeout: 30_000 });
    expect(cdn, 'CDN-kérés offline indítás után').toEqual([]);
  });

  test.describe('service workerrel', () => {
    test.use({ serviceWorkers: 'allow' });
    test('a szerver és a CDN is elérhetetlen: az oldal a gyorsítótárból nyílik, a PDF elkészül, CDN-kérés nincs', async ({ page, context, hibak }) => {
      test.setTimeout(150_000);
      hibak.enged(HALOZATI_KONZOL);
      hibak.enged(/ERR_CONNECTION_REFUSED|Could not connect|network connection was lost|Failed to fetch/i);
      // Saját, leállítható szerver: a leállítás után a cím tényleg nem érhető el. (WebKitben a context.setOffline
      // a service worker navigációját és a route()-ot is elrontja, ezért ezt az utat használjuk mindkét motorban.)
      const sz = await sajatSzerver();
      try {
        await page.clock.setFixedTime(new Date(IDO));
        await page.goto(sz.url + 'index.html');
        await kesz(page);
        await offlineKesz(page);
        await expect.poll(() => page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await caches.match('./index.html'))), { timeout: 30_000 }).toBe(true);
        context.cdnTiltva = true;
        const cdn = cdnKeresek(page);
        await sz.bezar();
        await page.reload();
        await kesz(page);
        expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'a lapot a service worker szolgálta ki').toBe(true);
        await orvosValaszt(page, 'Peti');
        await mennyBeir(page, 'tetel1', 2);
        const { nev, bajtok } = await letoltes(page);
        expect(nev).toBe('Arlista_Peti_2026-10-10.pdf');
        expect(pdfOldalSzam(bajtok)).toBe(1);
        expect(cdn, 'CDN-kérés offline indítás után').toEqual([]);
      } finally { await sz.bezar().catch(() => {}); }
    });
  });
});
