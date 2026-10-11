// Biztonság (XSS), statikus kódellenőrzés és versenyhelyzetek.
//
// A felhasználótól, az Excel-importból, a JSON-mentésből, a linkből, a GitHubról és a bemondásból érkező
// nevek sehol nem kerülhetnek szűretlenül HTML-be: a támadó nevek (<img onerror>, <svg onload>, idézőjel-,
// aposztróf-, emoji-, irányjel- és nagyon hosszú nevek) mindenhol szó szerint jelennek meg, és semmi nem fut le.
// A hibát feltáró tesztek a HELYES viselkedést várják (most pirosak); a címükben a hiba azonosítója áll.
import fs from 'node:fs';
import path from 'node:path';
import {
  test, expect, nyit, adatok, valasztas, orvosValaszt, mennyBeir, mennyMezo, tetelSor, letoltes, pdfElemez,
  pdfKozvetlen, sokTetel, KULCS, escRe
} from './segito.js';
import { GYOKER } from './cdn.js';
import {
  XSS, NEVEK, xssFigyelo, nincsXss, xlsxKeszit, jsonBuffer, mentesJson, arakNezet, listaNezet,
  vizszintesTulcsordulas, kilogoElemek, olvasFajl, SZKRIPT_UT, FEJ_UT, offlineKesz
} from './segito-biztonsag.js';

const IDO = '2026-10-10T09:00:00';
const XLSX_TIPUS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const nincsSzokoz = s => String(s).replace(/\s+/g, '');
const dlgNyitva = page => page.locator('#dlg[open]');

/* ======================================================================
   Statikus kódellenőrzés (a _fejlesztes/uj/szkript.js forrásán)
   ====================================================================== */
// Egy HTML-be író utasítás (innerHTML = … / html: …) teljes kifejezése a forrásból.
function kifejezesVege(src, i) {
  let melyseg = 0, sablon = 0, idezet = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j], elozo = src[j - 1];
    if (idezet) { if (c === idezet && elozo !== '\\') idezet = null; continue; }
    if (sablon && c === '`' && elozo !== '\\') { sablon--; continue; }
    if (c === "'" || c === '"') { idezet = c; continue; }
    if (c === '`') { sablon++; continue; }
    if (c === '(' || c === '[' || c === '{') melyseg++;
    else if (c === ')' || c === ']' || c === '}') { if (melyseg === 0) return j; melyseg--; }
    else if (melyseg === 0 && !sablon && (c === ';' || c === ',')) return j;
  }
  return src.length;
}
function htmlNyelok(src) {
  const r = [];
  const minta = /(?:\.innerHTML\s*=(?!=)|\bhtml:\s*)/g;
  let m;
  while ((m = minta.exec(src))) {
    const kezd = m.index + m[0].length;
    const kif = src.slice(kezd, kifejezesVege(src, kezd)).trim();
    const sor = src.slice(0, m.index).split('\n').length;
    r.push({ sor, kif });
  }
  return r;
}
// ${…} kifejezések egy (többsoros) kifejezésben, egymásba ágyazott zárójelekkel
function helyettesitesek(kif) {
  const r = [];
  for (let i = kif.indexOf('${'); i >= 0; i = kif.indexOf('${', i + 2)) {
    let m = 0, j = i + 2;
    for (; j < kif.length; j++) { if (kif[j] === '{') m++; else if (kif[j] === '}') { if (m === 0) break; m--; } }
    r.push(kif.slice(i + 2, j).trim());
  }
  return r;
}
const BIZTONSAGOS_HELYETTESITES = [
  /^esc\(.+\)$/s,                                   // escape-elt szöveg
  /^ikon\('[a-z]+'\)$/, /^ikon\([a-zA-Z]+\)$/,      // a beépített ikonok (állandó SVG)
  /^NBSP$/, /^[a-zA-Z]+\.length$/,                  // nem törő szóköz, darabszám
  /^i === 0 \? '[^'<>&]*' : ''$/                     // állandó szöveg
];
// Ismert, indokolt kivételek (nem felhasználói adat)
const KIVETEL = {
  v: 'az el() segéd html-ága: minden hívóját (html: …) külön ellenőrizzük',
  'f.svg': 'a CONFIG-ban megadott logó (a lab gazdája írja az index.html-be)',
  'gomb.dataset.eredeti': 'a gomb saját, korábban elmentett jelölése'
};
// Egy sablon nélküli kifejezés biztonságos, ha csak állandó szövegekből, ikon()/gombTartalom() hívásokból
// és ezek feltételes (a ? x : y) vagy + összefűzéséből áll.
function biztonsagosKifejezes(kif) {
  let k = kif.replace(/\s+/g, ' ').trim();
  k = k.replace(/'(?:[^'\\]|\\.)*'/g, 'S').replace(/"(?:[^"\\]|\\.)*"/g, 'S');
  for (let n = 0; n < 3; n++) k = k.replace(/\b(?:ikon|gombTartalom)\((?:[^()]|\([^()]*\))*\)/g, 'K');
  k = k.replace(/\bS\b/g, 'K');
  for (let elozo = null; elozo !== k;) {             // K + K, (K), feltétel ? K : K  →  K
    elozo = k;
    k = k.replace(/K \+ K/g, 'K').replace(/\(K\)/g, 'K').replace(/[\w.]+ \? K : K/g, 'K');
  }
  return k === 'K';
}
function nyeloHibai(kif) {
  if (Object.prototype.hasOwnProperty.call(KIVETEL, kif)) return [];
  const hibak = [];
  const sablonNelkul = kif.replace(/`(?:[^`\\]|\\.)*`/gs, t => {
    for (const x of helyettesitesek(t)) if (!BIZTONSAGOS_HELYETTESITES.some(re => re.test(x))) hibak.push('${' + x + '}');
    return "'S'";
  });
  if (!biztonsagosKifejezes(sablonNelkul)) hibak.push(kif.replace(/\s+/g, ' ').slice(0, 100));
  return hibak;
}

test.describe('statikus kódellenőrzés', () => {
  const src = olvasFajl(SZKRIPT_UT);

  test('minden innerHTML-be / html: attribútumba kerülő ${…} kifejezés esc()-elt vagy állandó', () => {
    const nyelok = htmlNyelok(src);
    expect(nyelok.length, 'HTML-nyelők száma').toBeGreaterThan(30);
    const hibas = [];
    for (const { sor, kif } of nyelok) for (const h of nyeloHibai(kif)) hibas.push(`szkript.js:${sor}: ${h}`);
    expect(hibas, 'szűretlen érték HTML-be írva').toEqual([]);
    // az ellenőrző maga is működik: a szűretlen mintákat jelzi
    expect(nyeloHibai("'<b>' + t.nev + '</b>'")).not.toEqual([]);
    expect(nyeloHibai("`<span>${t.nev}</span>` + ikon('x')")).not.toEqual([]);
    expect(nyeloHibai("ikon('pipa') + `<span>${esc(t.nev)}</span>`")).toEqual([]);
    // a gombfelirat-segéd és az esc() maga is helyes
    expect(src).toMatch(/const gombTartalom = \(ikonNev, szoveg\) => \(ikonNev \? ikon\(ikonNev\) : ''\) \+ `<span>\$\{esc\(szoveg\)\}<\/span>`;/);
    expect(src).toMatch(/function esc\(s\) \{ return String\(s\)\.replace\(\/\[&<>"'\]\/g/);
  });

  test('nincs más HTML- vagy kódfuttató nyelő (insertAdjacentHTML, outerHTML-írás, document.write, eval, new Function, srcdoc, on…-attribútum)', () => {
    const tiltott = [/insertAdjacentHTML/, /\.outerHTML\s*=(?!=)/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /srcdoc/, /setAttribute\(\s*['"]on/, /\.on[a-z]+\s*=\s*['"`]/];
    const talalat = tiltott.filter(re => re.test(src)).map(String);
    expect(talalat).toEqual([]);
  });

  test('a konzolra csak a váratlan hibák kerülnek (console.error a hibaSzoveg-ben); console.log / warn / debug nincs', () => {
    const hivasok = [...src.matchAll(/console\.(\w+)\(/g)].map(m => m[1]);
    expect(hivasok).toEqual(['error']);
    const hol = src.indexOf('console.error(e)');
    expect(src.lastIndexOf('function hibaSzoveg(e)', hol), 'a console.error a hibaSzoveg() függvényben van').toBeGreaterThan(src.lastIndexOf('\n}\n', hol));
  });

  test('a SheetJS (Excel-olvasó): vagy javított változat (legalább 0.20.2), vagy az ismert hibái a README „Ismert korlátok” részében dokumentálva vannak', () => {
    // CVE-2023-30533 (prototípus-szennyezés kártékony fájl olvasásakor, < 0.19.3) és CVE-2024-22363 (ReDoS, < 0.20.2).
    // Az ellenőrzés szerint (BIZ-01 cáfolva) ez dokumentált, vállalt korlát: a README megnevezi a változatot és a két hibát,
    // és csak saját, megbízható Excel-fájl betöltését javasolja. Ha a változat frissül (≥ 0.20.2), a megjegyzés elhagyható.
    const m = src.match(/xlsx:\s*\{\s*url:\s*'([^']+)'/);
    expect(m, 'KONYVTARAK.xlsx').toBeTruthy();
    const v = (m[1].match(/(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    expect(v.length, 'rögzített verziószám az xlsx címében').toBe(3);
    const szam = v[0] * 1e6 + v[1] * 1e3 + v[2];
    if (szam >= 20002) return;
    const readme = fs.readFileSync(path.join(GYOKER, 'README.md'), 'utf8');
    expect(readme, 'a README felsorolja a használt SheetJS-változatot').toContain(`SheetJS ${v.join('.')}`);
    const korlatok = readme.slice(readme.indexOf('Ismert korlátok'));
    expect(korlatok, 'a README „Ismert korlátok” része a CVE-2023-30533-at').toContain('CVE-2023-30533');
    expect(korlatok, 'a README „Ismert korlátok” része a CVE-2024-22363-at').toContain('CVE-2024-22363');
  });
});

/* ======================================================================
   CSP
   ====================================================================== */
test('[BIZ-02] a tartalombiztonsági szabály (CSP) nem engedi a befecskendezett inline eseménykezelőket', async ({ page, hibak }) => {
  // Az alkalmazás jelenleg sehol nem ír szűretlen nevet HTML-be (lásd a többi tesztet), de a CSP 'unsafe-inline'
  // engedélye miatt egy jövőbeli hiba azonnal kódfuttatás lenne. Mélységi védelem: inline onerror= ne fusson.
  // A javítás után a böngésző a letiltott eseménykezelőt konzolhibával jelzi (CSP-sértés) — ez itt a várt viselkedés.
  hibak.enged(/Content Security Policy|Refused to execute|inline event handler/i);
  const fej = olvasFajl(FEJ_UT);
  expect(fej).toContain('Content-Security-Policy');
  await nyit(page, { ido: IDO });
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:," onerror="window.__cspProba=1">';
    document.body.append(d);
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__cspProba), 'a befecskendezett onerror lefutott').toBeUndefined();
});

/* ======================================================================
   XSS — minden belépési ponton
   ====================================================================== */
test.describe('XSS: támadó nevek', () => {
  test('tárolóból (≤ 4 orvos): orvosválasztó, tételsorok, csoportcímek, összegsáv — szó szerint, kódfuttatás nélkül', async ({ page }) => {
    const f = xssFigyelo(page);
    const orvosok = [XSS.img, NEVEK.idezojel, NEVEK.aposztrof, NEVEK.emoji];
    const tetelek = [[XSS.svg, [1000, 2000, 3000, 4000], XSS.attr], [XSS.script, [100, 200, 300, 400], XSS.attr], [NEVEK.rtl, [5, 6, 7, 8], NEVEK.idezojel], [NEVEK.sablon, [9, 10, 11, 12], XSS.iframe]];
    const a = adatok({ orvosok, tetelek });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: XSS.img, menny: { [XSS.svg]: 2, [NEVEK.rtl]: 1 } }), ido: IDO });
    for (const o of orvosok) await expect(page.locator('#orvosValaszto button[role=radio]', { hasText: o })).toHaveText(o);
    await expect(page.locator('#orvosValaszto button[aria-checked=true]')).toHaveText(XSS.img);
    for (const [nev] of tetelek) await expect(tetelSor(page, nev).locator('.tetel-nev')).toHaveText(nev);
    await expect(page.locator('#tetelLista .csoport-cim span')).toHaveText([XSS.attr, NEVEK.idezojel, XSS.iframe]);
    await expect(page.locator('#osszeg')).toContainText('2 tétel');
    await orvosValaszt(page, NEVEK.aposztrof);
    await expect(tetelSor(page, XSS.svg).locator('.tetel-ar')).toContainText(/3\s000\sFt/);
    await nincsXss(page, f, '(árlista nézet)');
  });

  test('tárolóból (> 4 orvos, > 8 tétel): legördülő orvoslista és a kereső találatai szó szerint', async ({ page }) => {
    const f = xssFigyelo(page);
    const orvosok = [XSS.img, XSS.attr, XSS.attr2, NEVEK.idezojel, NEVEK.aposztrof, NEVEK.emoji];
    const nevek = [XSS.svg, XSS.script, XSS.iframe, XSS.alert, 'img ' + XSS.img, NEVEK.rtl, NEVEK.sablon, NEVEK.hosszu, NEVEK.hosszuSzo];
    const a = adatok({ orvosok, tetelek: nevek.map((n, i) => [n, orvosok.map((_, j) => 100 * (i + 1) + j)]) });
    await nyit(page, { adat: a, ido: IDO });
    await expect(page.locator('#orvosSelect option')).toHaveText(['Válassz orvost…', ...orvosok]);
    await orvosValaszt(page, XSS.attr2);
    await expect(page.locator('#orvosSelect')).toHaveValue(a.orvosok[2].id);
    // kereső: a találatok a tételnevet szó szerint mutatják
    await page.locator('#kereso').fill('img');
    await expect(page.locator('#keresoLista .opcio-nev').first()).toBeVisible();
    const talalatok = await page.locator('#keresoLista .opcio-nev').allTextContents();
    expect(talalatok).toContain('img ' + XSS.img);
    for (const t of talalatok) expect(nevek).toContain(t);
    // a „nincs ilyen” sor a beírt szöveget szó szerint idézi
    await page.locator('#kereso').fill('<u>qqzzxx</u>');
    await expect(page.locator('#keresoLista .kereso-ures')).toHaveText('Nincs „<u>qqzzxx</u>” nevű tétel.');
    // választás a találatok közül (billentyűvel: az első találat): az állapotsor is szó szerint
    await page.locator('#kereso').fill('img src');
    await expect(page.locator('#keresoLista .kereso-opcio .opcio-nev').first()).toHaveText('img ' + XSS.img);
    await page.locator('#kereso').press('Enter');
    await expect(page.locator('#keresoAllapot')).toContainText(`Hozzáadva: img ${XSS.img}`);
    await nincsXss(page, f, '(legördülő lista, kereső)');
  });

  test('sáv-üzenet és „Hiányzó ár” ablak: a hiányzó árú tételek nevei szó szerint', async ({ page }) => {
    const f = xssFigyelo(page);
    const a = adatok({ orvosok: [XSS.attr, 'Bea'], tetelek: [[XSS.img, [null, 100]], [XSS.svg, [null, 200]], ['Rendes', [300, 300]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: XSS.attr, menny: { [XSS.img]: 1, [XSS.svg]: 2, Rendes: 1 } }), ido: IDO });
    await expect(page.locator('#savUzenet')).toContainText(`Nincs megadott ár (Dr. ${XSS.attr}): ${XSS.img}, ${XSS.svg}.`);
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Hiányzó ár');
    await expect(page.locator('#dlg #dlgLeiras')).toHaveText(`Ezeknek a tételeknek nincs ára (Dr. ${XSS.attr}): ${XSS.img}, ${XSS.svg}.`);
    await nincsXss(page, f, '(sáv-üzenet, Hiányzó ár ablak)');
  });

  test('Árak nézet: táblázat, szerkesztő ablak (név, e-mail, csoport, más nevek), törlés-megerősítés, ár-hibaüzenet', async ({ page }) => {
    const f = xssFigyelo(page);
    const a = adatok({ orvosok: [{ nev: XSS.img, email: 'kiss@rendelo.hu' }, NEVEK.aposztrof], tetelek: [[XSS.svg, [100, 200], XSS.attr], [NEVEK.idezojel, [300, null], XSS.attr]] });
    await nyit(page, { adat: a, ido: IDO, hash: '#arak', tarolo: { 'dentAl.hangAliasok.v1': { [XSS.svg]: [XSS.alert.toLowerCase(), 'zirkon'] } } });
    await expect(page.locator('#arTabla .fej-gomb span')).toHaveText([XSS.img, NEVEK.aposztrof]);
    await expect(page.locator('#arTabla .sor-gomb span')).toHaveText([XSS.svg, NEVEK.idezojel]);
    await expect(page.locator('#arTabla .csoport-sor span')).toHaveText([XSS.attr]);
    // tétel szerkesztése: a mezők értéke szó szerint
    await page.locator('#arTabla .sor-gomb').first().click();
    await expect(page.locator('#nevMezo')).toHaveValue(XSS.svg);
    await expect(page.locator('#csoportMezo')).toHaveValue(XSS.attr);
    await expect(page.locator('#aliasMezo')).toHaveValue(`${XSS.alert.toLowerCase()}, zirkon`);
    await page.locator('#dlg button', { hasText: 'Tétel törlése' }).click();
    await expect(page.locator('#dlg #dlgLeiras')).toContainText(`„${XSS.svg}” tételt?`);
    await page.locator('#dlg button', { hasText: 'Mégse' }).click();
    // orvos szerkesztése
    await page.locator('#arTabla .fej-gomb').first().click();
    await expect(page.locator('#nevMezo')).toHaveValue(XSS.img);
    await expect(page.locator('#emailMezo')).toHaveValue('kiss@rendelo.hu');
    await page.locator('#dlg button', { hasText: 'Mégse' }).click();
    // hibás ár: az értesítés a neveket szó szerint idézi
    const mezo = page.locator(`.ar-mezo[data-t="${a.tetelek[0].id}"][data-o="${a.orvosok[0].id}"]`);
    await mezo.fill('abc');
    await mezo.press('Enter');
    await expect(page.locator('#uzenetek .uzenet.hiba').first()).toContainText(`${XSS.svg} · ${XSS.img}: az ár csak szám lehet`);
    await nincsXss(page, f, '(Árak nézet)');
  });

  test('új orvos és új tétel az Árak lapon támadó nevekkel → árlista, előnézet, PDF: szó szerint, a fájlnév megtisztítva', async ({ page, context }) => {
    const f = xssFigyelo(page);
    await nyit(page, { ido: IDO, hash: '#arak' });
    await page.locator('#ujOrvosGomb').click();
    await page.locator('#nevMezo').fill(XSS.img);
    await page.locator('#emailMezo').fill('uj@rendelo.hu');
    await page.locator('#dlg .dlg-lab button', { hasText: 'Hozzáadás' }).click();
    await expect(dlgNyitva(page)).toHaveCount(0);
    await page.locator('#ujTetelGomb').click();
    await page.locator('#nevMezo').fill(XSS.svg + ' ' + NEVEK.idezojel);
    await page.locator('#csoportMezo').fill(XSS.attr);
    await page.locator('#dlg .dlg-lab button', { hasText: 'Hozzáadás' }).click();
    await expect(dlgNyitva(page)).toHaveCount(0);
    const tetelNev = XSS.svg + ' ' + NEVEK.idezojel;
    const tarolt = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KULCS.adatok);
    const o = tarolt.orvosok.find(x => x.nev === XSS.img), t = tarolt.tetelek.find(x => x.nev === tetelNev);
    expect(o && t, 'az új orvos és tétel a tárolóban, szó szerint').toBeTruthy();
    const mezo = page.locator(`.ar-mezo[data-t="${t.id}"][data-o="${o.id}"]`);
    await mezo.fill('1234');
    await mezo.press('Enter');
    await expect.poll(() => page.evaluate(([k, t, o]) => JSON.parse(localStorage.getItem(k)).arak[t][o], [KULCS.adatok, t.id, o.id])).toBe(1234);
    await listaNezet(page);
    await orvosValaszt(page, XSS.img);
    await mennyBeir(page, tetelNev, 3);
    await expect(tetelSor(page, tetelNev).locator('.tetel-nev')).toHaveText(tetelNev);
    // előnézet: a leírás szó szerint
    await page.locator('#elonezetGomb').click();
    await expect(page.locator('#dlg #dlgLeiras')).toContainText(`Dr. ${XSS.img} · 2026.10.10.`);
    await page.locator('#dlg .dlg-zar').click();
    // letöltés: fájlnév megtisztítva, PDF-szöveg szó szerint
    const { nev, bajtok } = await letoltes(page);
    expect(nev).toMatch(/^Arlista_[^\\/:*?"<>|\u0000-\u001F]+_2026-10-10\.pdf$/);
    await expect(page.locator('#keszFajl')).toContainText(nev);
    const e = await pdfElemez(context, bajtok);
    const szoveg = nincsSzokoz(e.oldal[0].elemek.map(x => x.s).join(''));
    expect(szoveg).toContain(nincsSzokoz(`Dr. ${XSS.img}`));
    expect(szoveg).toContain(nincsSzokoz(tetelNev));
    expect(szoveg).toContain(nincsSzokoz(XSS.attr));          // csoportcím
    expect(e.info.Title).toContain(`Dr. ${XSS.img}`);
    await nincsXss(page, f, '(új orvos/tétel, előnézet, PDF)');
  });

  test('Excel-import: előnézet, hibalista (cellaértékek), munkalapnév a hibaüzenetben — szó szerint', async ({ page, context }) => {
    const f = xssFigyelo(page);
    await nyit(page, { ido: IDO, hash: '#arak' });
    const tolt = async buf => {
      await page.locator('#excelFajl').setInputFiles({ name: 'arak.xlsx', mimeType: XLSX_TIPUS, buffer: buf });
      await expect(page.locator('#dlg .dlg-lab button').first()).toBeVisible({ timeout: 60_000 });
    };
    // 1. munkalapnév: nincs „Adatbázis” lap → a hibaüzenet felsorolja a lapokat
    await tolt(await xlsxKeszit(context, { [XSS.alert]: [['', 'A'], ['t', 1]] }));
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Az Excel-fájl nem tölthető be');
    await expect(page.locator('#dlg #dlgLeiras')).toContainText(`(a lapok: ${XSS.alert})`);
    await page.locator('#dlg .dlg-lab button').click();
    // 2. hibás árak: a hibalista a cellaértékeket szó szerint idézi
    await tolt(await xlsxKeszit(context, { 'Adatbázis': [['', XSS.img, NEVEK.idezojel], [XSS.svg, XSS.alert, 100], [NEVEK.aposztrof, 5, XSS.script]] }));
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Az Excel-fájl nem tölthető be');
    await expect(page.locator('#dlg .lista-valtozas li')).toHaveText([`B2: „${XSS.alert}” nem szám.`, `C3: „${XSS.script}” nem szám.`]);
    await page.locator('#dlg .dlg-lab button').click();
    // 3. helyes fájl: az előnézet címkéi szó szerint, betöltés után a táblázatban is
    const orvosok = [XSS.img, NEVEK.idezojel, XSS.attr2];
    await tolt(await xlsxKeszit(context, { 'Adatbázis': [['', ...orvosok], [XSS.iframe + ':'], [XSS.svg, 100, 200, 300], [NEVEK.aposztrof, 400, 500, 600], [NEVEK.emoji, 7, 8, 9]] }));
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Excel-import előnézete');
    await expect(page.locator('#dlg .cimke.uj', { hasText: XSS.img })).toHaveText(XSS.img);
    await expect(page.locator('#dlg .cimke.uj', { hasText: NEVEK.aposztrof })).toHaveText(NEVEK.aposztrof);
    await page.locator('#dlg .dlg-lab button').last().click();
    await expect(page.locator('#arTabla .fej-gomb span')).toHaveText(orvosok);
    await expect(page.locator('#arTabla .sor-gomb span')).toHaveText([XSS.svg, NEVEK.aposztrof, NEVEK.emoji]);
    await expect(page.locator('#arTabla .csoport-sor span')).toHaveText([XSS.iframe]);
    await nincsXss(page, f, '(Excel-import)');
  });

  test('JSON-visszatöltés: előnézet és betöltés szó szerint; a „__proto__” és „constructor” nevek nem szennyezik a prototípust, az áruk megmarad', async ({ page }) => {
    const f = xssFigyelo(page);
    await nyit(page, { ido: IDO, hash: '#arak' });
    const elotte = await page.evaluate(() => Object.getOwnPropertyNames(Object.prototype).sort().join(','));
    // kézzel írt JSON: a "__proto__" saját kulcsként szerepel (objektum-literálban a prototípust állítaná)
    const json = `{"alkalmazas":"dentAl-arlista","formatum":1,"mentve":"2026-10-10T07:00:00.000Z",
      "orvosok":["__proto__","constructor",${JSON.stringify(XSS.img)}],
      "emailek":{${JSON.stringify(XSS.img)}:"x@y.hu","constructor":"<script>@x.hu"},
      "tetelek":[{"nev":"__proto__","arak":{"__proto__":100,"constructor":200,${JSON.stringify(XSS.img)}:300},"csoport":${JSON.stringify(XSS.attr)}},
                 {"nev":${JSON.stringify(XSS.svg)},"arak":{"__proto__":"<b>sok</b>","constructor":2,${JSON.stringify(XSS.img)}:3}}],
      "beallitasok":{"__proto__":{"szennyezett":1},"nullazas":true}}`;
    await page.locator('#jsonFajl').setInputFiles({ name: XSS.alert.replace(/[<>]/g, '') + '.json', mimeType: 'application/json', buffer: jsonBuffer(json) });
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Mentés visszatöltése');
    await expect(page.locator('#dlg .cimke.uj', { hasText: XSS.img })).toHaveText(XSS.img);
    await expect(page.locator('#dlg .figyelmeztetes')).toContainText(`${XSS.svg} · __proto__: „<b>sok</b>” nem érvényes ár, kimarad.`);
    await page.locator('#dlg .dlg-lab button').last().click();
    await expect(page.locator('#arTabla .fej-gomb span')).toHaveText(['__proto__', 'constructor', XSS.img]);
    const allapot = await page.evaluate(k => {
      const a = JSON.parse(localStorage.getItem(k));
      const id = n => a.orvosok.find(o => o.nev === n).id;
      const t = n => a.tetelek.find(x => x.nev === n).id;
      return {
        arak: [a.arak[t('__proto__')][id('__proto__')], a.arak[t('__proto__')][id('constructor')], a.arak[t('__proto__')][id(a.orvosok[2].nev)], a.arak[t(a.tetelek[1].nev)][id('constructor')]],
        szennyezett: ({}).szennyezett, proto: Object.getOwnPropertyNames(Object.prototype).sort().join(',')
      };
    }, KULCS.adatok);
    expect(allapot.arak).toEqual([100, 200, 300, 2]);
    expect(allapot.szennyezett).toBeUndefined();
    expect(allapot.proto).toBe(elotte);
    await nincsXss(page, f, '(JSON-visszatöltés)');
  });

  test('link-import (#adatok=…): előnézet és betöltés szó szerint', async ({ page, context }) => {
    await nyit(page, { ido: IDO });
    const neves = {
      orvosok: [XSS.img, NEVEK.aposztrof], emailek: { [XSS.img]: 'a@b.hu' },
      tetelek: [{ nev: XSS.svg, arak: { [XSS.img]: 111, [NEVEK.aposztrof]: 222 }, csoport: XSS.attr }, { nev: NEVEK.idezojel, arak: { [XSS.img]: 333 }, csoport: '' }]
    };
    const link = await page.evaluate(n => window.dentAl.linkKeszit(n), neves);
    expect(link).toContain('#adatok=');
    const p2 = await context.newPage();
    const f = xssFigyelo(p2);
    await p2.goto(link);
    await expect(p2.locator('#dlg #dlgCim')).toHaveText('Árak betöltése linkből');
    await expect(p2.locator('#dlg .dlg-tartalom p.halvany').first()).toHaveText(`2 orvos (${XSS.img}, ${NEVEK.aposztrof}), 2 tétel`);
    await expect(p2.locator('#dlg .cimke.uj', { hasText: XSS.svg })).toHaveText(XSS.svg);
    await p2.locator('#dlg .dlg-lab button').last().click();
    await expect(p2.locator('#orvosValaszto button[role=radio]')).toHaveText([XSS.img, NEVEK.aposztrof]);
    await expect(tetelSor(p2, XSS.svg).locator('.tetel-nev')).toHaveText(XSS.svg);
    await nincsXss(p2, f, '(link-import)');
    await nincsXss(page, xssFigyelo(page), '(az első lap)');
  });

  test('GitHub: a mentett árlisták listája és az árak változatai (fájlnevek, commit-üzenetek) szó szerint', async ({ page }) => {
    const f = xssFigyelo(page);
    // (a fájlnévben az aláhúzás szóközt jelent, a / mappát választ el: ezért ezek a támadó nevek nem tartalmazzák)
    const pdfUtak = [
      `arlistak/2026-10/20261010-01_Arlista_${XSS.alert}_2026-10-10.pdf`,
      `arlistak/2026-10/20261010-02_Arlista_${NEVEK.aposztrof}_2026-10-10.pdf`,
      `arlistak/2026-09/${XSS.img}.pdf`
    ];
    const kesz = (route, status, body) => route.fulfill({
      status, body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, PUT, OPTIONS', 'access-control-expose-headers': '*' }
    });
    await page.route(/^https:\/\/api\.github\.com\//, route => {
      const r = route.request(); const u = new URL(r.url());
      if (r.method() === 'OPTIONS') return kesz(route, 204, '');
      if (/\/git\/trees\//.test(u.pathname)) return kesz(route, 200, { tree: pdfUtak.map(path => ({ type: 'blob', path })) });
      if (/\/commits$/.test(u.pathname)) return kesz(route, 200, [{ sha: 'abc123', commit: { author: { date: '2026-10-09T10:00:00Z' }, message: `${XSS.img} árak\nmásodik sor ${XSS.script}` } }]);
      if (/\/contents\/arlistak\//.test(u.pathname) && r.method() === 'GET' && !/\.pdf$/.test(u.pathname)) return kesz(route, 200, []);
      return kesz(route, 404, { message: 'Not Found' });
    });
    await nyit(page, { ido: IDO, tarolo: { [KULCS.github]: { tarolo: 'teszt/mentesek', token: 'teszt-kulcs-nem-valodi', ag: 'main', pdfMentes: true, arMentes: true } } });
    await page.locator('#mentesekGomb').click();
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Mentett árlisták');
    await expect(page.locator('#dlg .mentett-sor strong')).toHaveText([`Dr. ${NEVEK.aposztrof}`, `Dr. ${XSS.alert}`, `${XSS.img}.pdf`], { timeout: 20_000 });
    await expect(page.locator('#dlg .honap-cim')).toHaveText(['2026. október', '2026. szeptember']);
    await page.locator('#dlg .mentett-kereso').fill('<u>qqzzxx</u>');
    await expect(page.locator('#dlg .mentett-lista p.halvany')).toHaveText('Nincs találat erre: „<u>qqzzxx</u>”.');
    await page.locator('#dlg .dlg-zar').click();
    await arakNezet(page);
    await page.locator('#ghBeallitas button', { hasText: 'Az árak korábbi változatai' }).click();
    await expect(page.locator('#dlg .mentett-sor span').first()).toHaveText(`${XSS.img} árak`, { timeout: 20_000 });
    await nincsXss(page, f, '(GitHub-listák)');
  });

  test('bemondás: az átirat, az élő előnézet és az eredmény-ablak a kimondott szöveget és a neveket szó szerint mutatja', async ({ page }) => {
    const kimondott = `két ${XSS.img} és egy ${NEVEK.aposztrof} meg ${XSS.alert}`;
    await page.addInitScript(szoveg => {             // beszédfelismerő-utánzat: egy végleges eredmény, majd leáll, ha leállítják
      class Hamis {
        constructor() { Hamis.db = (Hamis.db || 0) + 1; this.sorszam = Hamis.db; }
        start() {
          if (this.sorszam !== 1) return;
          setTimeout(() => { const alt = [{ transcript: szoveg, confidence: 0.9 }]; alt.isFinal = true; if (this.onresult) this.onresult({ resultIndex: 0, results: [alt] }); }, 50);
        }
        stop() { setTimeout(() => this.onend && this.onend(), 20); }
        abort() { setTimeout(() => this.onend && this.onend(), 20); }
      }
      window.SpeechRecognition = Hamis; window.webkitSpeechRecognition = Hamis;
    }, kimondott);
    const f = xssFigyelo(page);
    const a = adatok({ orvosok: ['Peti'], tetelek: [[XSS.img, [100]], [NEVEK.aposztrof, [200]], ['Cirkon korona', [300]]] });
    await nyit(page, { adat: a, ido: IDO });
    await page.locator('#hangGomb').click();
    await expect(page.locator('#dlg .hang-atirat')).toHaveText(kimondott);
    await page.locator('#dlg .dlg-lab button', { hasText: 'Kész' }).click();
    await expect(page.locator('#dlg #dlgCim')).toHaveText(/Bemondás/);
    await expect(page.locator('#dlg .dlg-tartalom p.halvany').first()).toHaveText(`Ezt értettem: „${kimondott}”`);
    // a felismert tételek (ha vannak) a tételnevekkel szó szerint egyeznek; a kérdések a kimondott részt idézik
    const sorok = await page.locator('#dlg .lista-valtozas li > span:first-child').allTextContents();
    for (const s of sorok) expect([XSS.img, NEVEK.aposztrof, 'Cirkon korona', 'Orvos']).toContain(s);
    const kerdesek = await page.locator('#dlg .figyelmeztetes > span:first-child').allTextContents();
    for (const k of kerdesek) expect(k).toMatch(/^„[^”]*” – /);
    await nincsXss(page, f, '(bemondás)');
  });

  test('[KOD-05] nagyon hosszú nevek (szóközzel és szóköz nélkül): semmi nem lóg ki a képernyőről (árlista, alsó sáv a PDF-gombbal, ablak)', async ({ page }) => {
    const a = adatok({ orvosok: [NEVEK.hosszuSzo, NEVEK.hosszu], tetelek: [[NEVEK.hosszuSzo + 'T', [null, 100]], [NEVEK.hosszu, [100, 100]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: NEVEK.hosszuSzo, menny: { [NEVEK.hosszuSzo + 'T']: 1, [NEVEK.hosszu]: 2 } }), ido: IDO });
    await expect(page.locator('#savUzenet')).toBeVisible();
    expect(await vizszintesTulcsordulas(page), 'árlista + sáv-üzenet').toMatchObject({ tul: false });
    expect(await kilogoElemek(page, '#nezetArlista')).toEqual([]);
    expect(await kilogoElemek(page, '#sav'), 'az alsó sáv elemei (a sáv-üzenet és a PDF-gomb) kilógnak').toEqual([]);
    const gomb = await page.locator('#letoltGomb').boundingBox();
    expect(gomb.x + gomb.width, 'a „PDF letöltése” gomb jobb széle a képernyőn belül').toBeLessThanOrEqual(page.viewportSize().width);
    await page.locator('#letoltGomb').click();
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Hiányzó ár');
    expect(await vizszintesTulcsordulas(page), 'Hiányzó ár ablak').toMatchObject({ tul: false });
    expect(await kilogoElemek(page, '#dlg')).toEqual([]);
  });

  test('[KOD-05] valószerű hosszú összetett szó (38 és 54 karakter, ár nélkül): a sáv-üzenet telefonon sem lóg ki a képernyőről', async ({ page }) => {
    // Nem kell 320 karakter: egy 38–54 karakteres, szóköz nélküli tételnév (összetett szó, aláhúzásos termékkód)
    // a „Nincs megadott ár …” üzenetet már 360–375 px-en kitolja (az üzenet jobb széle ~370–470 px).
    const szavak = ['Fémkerámiakoronaimplantátumfelépítmény', 'Szuperhosszúszóösszetételűkerámiakoronajavításiművelet'];
    const a = adatok({ orvosok: ['Peti', 'Dani'], tetelek: [[szavak[0], [null, 100]], [szavak[1], [null, 200]], ['Korona', [100, 100]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { [szavak[0]]: 1, [szavak[1]]: 1, Korona: 1 } }), ido: IDO });
    await expect(page.locator('#savUzenet')).toContainText(szavak[0]);
    expect(await kilogoElemek(page, '#sav'), 'a sáv-üzenet (és a sáv) jobbra kilóg').toEqual([]);
  });
});

/* ======================================================================
   PDF és fájlnév különleges nevekkel
   ====================================================================== */
test.describe('PDF és fájlnév', () => {
  test('XSS-, idézőjeles és aposztrófos nevek szó szerint a PDF szövegében és metaadataiban', async ({ page, context }) => {
    const tetelek = [XSS.img, XSS.script, NEVEK.idezojel, NEVEK.aposztrof, NEVEK.sablon];
    const a = adatok({ orvosok: [NEVEK.idezojel + ' ' + NEVEK.aposztrof], tetelek: tetelek.map((n, i) => [n, [100 * (i + 1)], i < 2 ? XSS.attr : '']) });
    const menny = Object.fromEntries(tetelek.map(n => [n, 1]));
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: a.orvosok[0].nev, menny }), ido: IDO });
    const k = await pdfKozvetlen(page);
    expect(k.fajlnev).toBe(`Arlista_Dr._Kiss_O''Brien_2026-10-10.pdf`);
    const e = await pdfElemez(context, Buffer.from(k.b64, 'base64'));
    const szoveg = nincsSzokoz(e.oldal[0].elemek.map(x => x.s).join(''));
    for (const n of tetelek) expect(szoveg, n).toContain(nincsSzokoz(n));
    expect(szoveg).toContain(nincsSzokoz(XSS.attr));
    // a név már „Dr.”-ral kezdődik: nem kap még egy előtagot
    expect(szoveg).toContain(nincsSzokoz(`Címzett: ${NEVEK.idezojel} ${NEVEK.aposztrof}`));
    expect(e.info.Title).toBe(`dentÁl árlista – ${NEVEK.idezojel} ${NEVEK.aposztrof} – 2026.10.10.`);
  });

  test('[KOD-04] a betűkészletben nem szereplő jelek (emoji, irányjelek) nem kerülnek üres négyzetként a PDF-be', async ({ page, context }) => {
    // Az IBM Plex Sans-ban nincs emoji és nincs U+200F / U+202E: a pdfmake ezeket .notdef (üres négyzet) jellel nyomtatja.
    // A betűkészletben MEGLÉVŐ jelek (®, ™, ©, ↔ — fogtechnikai terméknevekben gyakori a ® és a ™) viszont nem tűnhetnek
    // el: egy túl széles emoji-szűrő (pl. \p{Extended_Pictographic}) ezeket is törölné.
    const VEDETT = 'IPS e.max® Press™ ↔ ©';
    const a = adatok({ orvosok: [NEVEK.emoji], tetelek: [['Fog 🦷 korona', [100]], ['Anna ‏másolat‮', [200]], [VEDETT, [300]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: NEVEK.emoji, menny: { 'Fog 🦷 korona': 1, 'Anna ‏másolat‮': 1, [VEDETT]: 1 } }), ido: IDO });
    const k = await pdfKozvetlen(page);
    const e = await pdfElemez(context, Buffer.from(k.b64, 'base64'));
    const szoveg = e.oldal[0].elemek.map(x => x.s).join(' ');
    expect(szoveg).toContain('Fog');
    expect(szoveg).toContain('korona');
    expect(nincsSzokoz(szoveg), 'a betűkészletben meglévő ®, ™, ©, ↔ jelek a PDF-ben maradnak').toContain(nincsSzokoz(VEDETT));
    expect([...szoveg].filter(c => c === '\u0000').length, 'üres négyzetként nyomtatott (.notdef) jelek a PDF-ben').toBe(0);
  });

  test('[KOD-03] fájlnév: a 80 karakteres vágás nem hagy félbevágott emojit (hibás UTF-16) a letöltött fájl nevében', async ({ page }) => {
    const nev = 'A'.repeat(79) + '😀 Kft';
    const a = adatok({ orvosok: [nev], tetelek: [['t1', [100]]] });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: nev, menny: { t1: 1 } }), ido: IDO });
    // a jól formáltságot a böngészőben kell nézni (az átadás a félbevágott karaktert U+FFFD-re cserélheti)
    const belso = await page.evaluate(n => {
      const f = window.dentAl.fajlnev(n, new Date(2026, 9, 10));
      const jo = !/[\uD800-\uDFFF]/.test(f.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''));
      return { jo, kodok: [...f.slice(84, 92)].map(c => c.codePointAt(0).toString(16)) };
    }, nev);
    expect(belso.jo, `az alkalmazás fájlneve jól formált UTF-16 (a vágás körüli kódpontok: ${belso.kodok.join(' ')})`).toBe(true);
    const { nev: letoltott } = await letoltes(page);
    expect(letoltott.isWellFormed(), JSON.stringify(letoltott)).toBe(true);
    expect(letoltott).not.toContain('�');
    expect(letoltott).toMatch(/^Arlista_A{79}.*_2026-10-10\.pdf$/);
  });
});

/* ======================================================================
   Versenyhelyzetek: dupla kattintás, újrabelépő párbeszédablak
   ====================================================================== */
test.describe('versenyhelyzetek', () => {
  const sorszamNap = page => page.evaluate(k => { try { return (JSON.parse(localStorage.getItem(k)) || { napok: {} }).napok['20261010'] || 0; } catch (e) { return 0; } }, KULCS.sorszam);
  async function elokeszitve(page, { nullazas = false, orvosok = ['Peti', 'Dani', 'Anna'] } = {}) {
    const a = adatok({ orvosok });
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Peti', menny: { tetel1: 2 } }), beall: { nullazas }, ido: IDO });
    await expect.poll(() => page.evaluate(() => !!(window.dentAl.elokeszitett && window.dentAl.elokeszitett.kulcs)), { timeout: 45_000 }).toBe(true);
    const letoltesek = [];
    page.on('download', d => letoltesek.push(d.suggestedFilename()));
    return letoltesek;
  }

  test('dupla kattintás a „PDF letöltése” gombon (előkészített PDF, két kattintás egy lépésben): egy letöltés, egy sorszám', async ({ page }) => {
    const l = await elokeszitve(page);
    await page.evaluate(() => { const b = document.querySelector('#letoltGomb'); b.click(); b.click(); });
    await expect.poll(() => l.length).toBe(1);
    await page.waitForTimeout(2500);
    expect(l).toEqual(['Arlista_Peti_2026-10-10.pdf']);
    expect(await sorszamNap(page)).toBe(1);
  });

  test('dupla kattintás (egér/ujj) a „PDF letöltése” gombon: egy új sorszám, legfeljebb ugyanaz a fájl', async ({ page }) => {
    const l = await elokeszitve(page);
    await page.locator('#letoltGomb').dblclick();
    await expect.poll(() => l.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(2500);
    expect(await sorszamNap(page)).toBe(1);
  });

  test('dupla kattintás közvetlenül a mennyiség megadása után (a PDF még nincs előkészítve): egy letöltés, egy sorszám', async ({ page }) => {
    const a = adatok();
    await nyit(page, { adat: a, valasztas: valasztas(a, { orvos: 'Dani' }), beall: { nullazas: false }, ido: IDO });
    const l = []; page.on('download', d => l.push(d.suggestedFilename()));
    await mennyBeir(page, 'tetel3', 4);
    await page.evaluate(() => { const b = document.querySelector('#letoltGomb'); b.click(); b.click(); });
    await expect.poll(() => l.length, { timeout: 45_000 }).toBe(1);
    await page.waitForTimeout(2500);
    expect(l).toEqual(['Arlista_Dani_2026-10-10.pdf']);
    expect(await sorszamNap(page)).toBe(1);
  });

  test('dupla kattintás a „Megosztás” gombon (Web Share elérhető): egyetlen megosztás, egy sorszám', async ({ page }) => {
    await page.addInitScript(() => {
      window.__megosztasok = 0;
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: () => { window.__megosztasok++; return new Promise(r => setTimeout(r, 400)); } });
    });
    await elokeszitve(page);
    await expect(page.locator('#megosztGomb')).toBeVisible();
    await page.evaluate(() => { const b = document.querySelector('#megosztGomb'); b.click(); b.click(); });
    await expect(page.locator('#keszCim')).toContainText('Megosztva');
    expect(await page.evaluate(() => window.__megosztasok)).toBe(1);
    expect(await sorszamNap(page)).toBe(1);
  });

  test('dupla kattintás (egér/ujj) a Gmail gombon megosztás nélküli eszközön: egy sorszám', async ({ page }) => {
    // (Két szinkron .click() itt nem mérvadó: az első kattintás után a gomb eltűnik a kész-sáv mögött, a második valódi
    // kattintás már a kész-sáv gombjára esik.)
    await page.addInitScript(() => { window.__ablakok = []; window.open = u => { window.__ablakok.push(String(u)); return {}; }; });
    const l = await elokeszitve(page, { orvosok: [{ nev: 'Peti', email: 'peti@rendelo.hu' }, 'Dani', 'Anna'] });
    await expect(page.locator('#gmailGomb')).toBeVisible();
    await page.locator('#gmailGomb').dblclick();
    await expect.poll(() => l.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(2500);
    expect(await sorszamNap(page), 'lefoglalt sorszámok').toBe(1);
    const ablakok = await page.evaluate(() => window.__ablakok);
    expect(ablakok.length).toBeGreaterThanOrEqual(1);
    expect(ablakok[0]).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&tf=1&to=peti%40rendelo\.hu&su=/);
  });

  test('[KOD-02] az Előnézet ablak „PDF letöltése” gombja túlcsorduló listánál: a „Nem fér el egy oldalon” ablak nyitva marad', async ({ page }) => {
    test.setTimeout(150_000);
    const a = sokTetel(70);
    const menny = Object.fromEntries(a.tetelek.map(t => [t.id, 1]));
    await nyit(page, { adat: a, valasztas: { orvosId: 'o1', menny, datum: null }, ido: IDO });
    await page.locator('#elonezetGomb').click();
    await expect(page.locator('#dlg .hibadoboz')).toContainText('nem fér el egy A4-es oldalon', { timeout: 90_000 });
    await page.locator('#dlg .dlg-lab button', { hasText: 'PDF letöltése' }).click();
    await page.waitForTimeout(600);
    await expect(dlgNyitva(page), 'a megnyílt figyelmeztető ablakot a gomb azonnal bezárta').toHaveCount(1);
    await expect(page.locator('#dlg #dlgCim')).toHaveText('Nem fér el egy oldalon');
  });
});
