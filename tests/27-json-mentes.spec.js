// 2. Funkcionális tesztek — JSON-mentés és -visszatöltés: oda-vissza adatvesztés nélkül (orvosok, e-mailek, tételek,
// csoportok, árak — 0 Ft-os, tört és hiányzó ár is —, beállítások, a bemondás más nevei), valamint sérült JSON-nal.
import { test, expect, nyit, adatok, valasztas, KULCS, uzenetNaploIndit, uzenetNaplo } from './segito.js';
import { ujratolt, ny, taroloPillanat, taroltAdat, taroltBeall, nevesAlak, arakMegnyit, fajlValaszt, dlgGomb, dlgNyitva, dlgZarva, tetelSorGomb } from './segito-funkcio.js';

const IDO = '2026-10-10T09:00:00';
const ALIAS_KULCS = 'dentAl.hangAliasok.v1';

// gazdag adat: csoportok, e-mailek, ékezetes nevek, 0 Ft-os, tört és hiányzó ár
function gazdagAdat() {
  return adatok({
    orvosok: [{ nev: 'Dr. Szűcs Ádám', email: 'szucs@rendelo.hu' }, { nev: 'Kovács Őrs', email: '' }, { nev: 'Anna', email: 'anna@pelda.hu' }],
    tetelek: [
      ['Cirkon korona', [25000, 24500.5, null], 'Rögzített pótlások'],
      ['Fémkerámia', [17000, 0, 16000], 'Rögzített pótlások'],
      ['Teljes fogsor', [70000, 69999.99, 0.1], 'Protetika'],
      ['Fogsorjavítás – foganként', [null, null, 3000], 'Protetika'],
      ['Ínymaszk "kicsi" <b>', [3000, 3000, 3000], '']
    ]
  });
}
async function jsonMentes(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#jsonMentesGomb').click()]);
  const fs = await import('node:fs');
  const szoveg = fs.readFileSync(await dl.path(), 'utf8');
  return { nev: dl.suggestedFilename(), szoveg, json: JSON.parse(szoveg) };
}
async function visszatolt(page, fajl) {
  await fajlValaszt(page, '#jsonBetoltesGomb', fajl);
  return dlgNyitva(page);
}
const jsonFajl = (szoveg, nev = 'dental_arak_2026-10-10.json') => ({ name: nev, mimeType: 'application/json', buffer: Buffer.isBuffer(szoveg) ? szoveg : Buffer.from(szoveg, 'utf8') });
// „másik telefon”: üres tároló, a beépített mintaadatokkal
async function uresEszkoz(page) {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('dentAl.')) localStorage.removeItem(k); });
  await ujratolt(page);
  await arakMegnyit(page);
  await expect(page.locator('#arTabla thead .fej-gomb')).toHaveText(['Peti', 'Dani', 'Anna']);
}

test('Mentés fájlba: dental_arak_<dátum>.json, benne az orvosok, e-mailek, tételek, csoportok, árak és a beállítások', async ({ page }) => {
  const a = gazdagAdat();
  await uzenetNaploIndit(page);
  await nyit(page, { adat: a, beall: { nullazas: false, szinesLogo: false }, ido: IDO });
  await arakMegnyit(page);
  const m = await jsonMentes(page);
  expect(m.nev).toBe('dental_arak_2026-10-10.json');
  await expect.poll(() => uzenetNaplo(page).then(n => n.join('\n'))).toContain('A mentés letöltődött.');
  expect(m.json.alkalmazas).toBe('dentAl-arlista');
  expect(m.json.formatum).toBe(1);
  expect(Number.isNaN(Date.parse(m.json.mentve))).toBe(false);
  expect(m.json.orvosok).toEqual(['Dr. Szűcs Ádám', 'Kovács Őrs', 'Anna']);
  expect(m.json.emailek).toEqual({ 'Dr. Szűcs Ádám': 'szucs@rendelo.hu', Anna: 'anna@pelda.hu' });
  expect(m.json.tetelek).toEqual(nevesAlak(a).tetelek.map(t => ({ nev: t.nev, arak: t.arak, csoport: t.csoport })));
  expect(m.json.beallitasok).toEqual({ nullazas: false, szinesLogo: false });
  expect(m.szoveg, 'a GitHub-kulcs soha nem kerülhet a mentésbe').not.toMatch(/token|github_pat/i);
});

test('oda-vissza: mentés → „másik telefon” (üres tároló) → visszatöltés = az eredeti adat, beállítások is', async ({ page }) => {
  const a = gazdagAdat();
  await nyit(page, { adat: a, beall: { nullazas: false, szinesLogo: false }, ido: IDO });
  await arakMegnyit(page);
  const eredeti = nevesAlak(await taroltAdat(page));
  const m = await jsonMentes(page);
  await uresEszkoz(page);
  const d = await visszatolt(page, jsonFajl(m.szoveg));
  await expect(d.locator('#dlgCim')).toHaveText('Mentés visszatöltése');
  await expect(d).toContainText('dental_arak_2026-10-10.json · mentve:');
  await expect(d).toContainText('A beállítások (mennyiségek nullázása, logó) a mentés szerint változnak.');
  await dlgGomb(page, 'Felülírás (6 törlődik)').click();     // Peti, Dani és tetel1–4
  await dlgZarva(page);
  expect(nevesAlak(await taroltAdat(page))).toEqual(eredeti);
  expect(await taroltBeall(page)).toEqual({ nullazas: false, szinesLogo: false });
  await expect(page.locator('#beallNullazas')).not.toBeChecked();
  await expect(page.locator('#beallMono')).toBeChecked();
  // a visszatöltött adatból készült újabb mentés ugyanaz (az időbélyeg kivételével)
  const m2 = await jsonMentes(page);
  expect(Object.assign({}, m2.json, { mentve: null })).toEqual(Object.assign({}, m.json, { mentve: null }));
});

test('visszatöltés ugyanarra az állapotra: „nincs mit frissíteni”, a tároló nem változik', async ({ page }) => {
  await nyit(page, { adat: gazdagAdat(), ido: IDO });
  await arakMegnyit(page);
  const m = await jsonMentes(page);
  const elotte = await taroloPillanat(page);
  const d = await visszatolt(page, jsonFajl(m.szoveg));
  await expect(d).toContainText('Az árak megegyeznek a jelenlegiekkel; nincs mit frissíteni.');
  await dlgGomb(page, 'Bezárás').click();
  await dlgZarva(page);
  expect(await taroloPillanat(page)).toEqual(elotte);
});

test('„Mégse” a visszatöltés előnézetében: a tároló bájtra azonos', async ({ page }) => {
  await nyit(page, { adat: gazdagAdat(), ido: IDO });
  await arakMegnyit(page);
  const m = await jsonMentes(page);
  await uresEszkoz(page);
  const a = adatok();
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KULCS.adatok, a]);
  const elotte = await taroloPillanat(page);
  const d = await visszatolt(page, jsonFajl(m.szoveg));
  await expect(d.locator('.cimkek').first()).toContainText('3 orvos');
  await dlgGomb(page, 'Mégse').click();
  await dlgZarva(page);
  expect(await taroloPillanat(page)).toEqual(elotte);
});

test('[FUN-06] a bemondás más nevei (Árak → tétel → „Más nevek”) is benne vannak a mentésben, és visszatöltődnek', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, tarolo: { [ALIAS_KULCS]: { tetel1: ['zirkon', 'cirkónia'] } }, ido: IDO });
  await arakMegnyit(page);
  await tetelSorGomb(page, 'tetel1').click();
  await expect(page.locator('#aliasMezo')).toHaveValue('zirkon, cirkónia');
  await page.keyboard.press('Escape');
  const m = await jsonMentes(page);
  await uresEszkoz(page);
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KULCS.adatok, adatok({ tetelek: [['tetel1', [1, 2, 3]], ['tetel9', [1, 2, 3]]] })]);
  await ujratolt(page);
  await arakMegnyit(page);
  const d = await visszatolt(page, jsonFajl(m.szoveg));
  await d.locator('.dlg-lab button').last().click();
  await dlgZarva(page);
  await tetelSorGomb(page, 'tetel1').click();
  await expect(page.locator('#aliasMezo'), 'a „Más nevek a bemondáshoz” a mentéssel együtt jön vissza').toHaveValue('zirkon, cirkónia');
});

test('[FUN-06] ha a mentés csak a más nevekben tér el (az árak azonosak), a visszatöltés akkor is visszahozza őket', async ({ page }) => {
  const a = adatok();
  await nyit(page, { adat: a, tarolo: { [ALIAS_KULCS]: { tetel2: ['fémkerámia', 'fk'] } }, ido: IDO });
  await arakMegnyit(page);
  const m = await jsonMentes(page);
  // ugyanazon az eszközön a más nevek elvesznek (pl. törölte őket), az árak maradnak
  await page.evaluate(k => localStorage.removeItem(k), ALIAS_KULCS);
  await ujratolt(page);
  await arakMegnyit(page);
  const d = await visszatolt(page, jsonFajl(m.szoveg));
  await expect(d.locator('.dlg-lab button').last(), 'van mit visszatölteni: a más nevek').not.toHaveText('Bezárás');
  await d.locator('.dlg-lab button').last().click();
  await dlgZarva(page);
  await tetelSorGomb(page, 'tetel2').click();
  await expect(page.locator('#aliasMezo')).toHaveValue('fémkerámia, fk');
});

/* ------------------------------------------------------------ sérült / rossz mentés */
const egyMentes = JSON.stringify({ alkalmazas: 'dentAl-arlista', formatum: 1, mentve: '2026-10-09T10:00:00.000Z', cegnev: 'dentÁl', orvosok: ['Peti', 'Dani'], emailek: {}, tetelek: [{ nev: 'tetel1', arak: { Peti: 1, Dani: 2 }, csoport: '' }], beallitasok: {} }, null, 2);
const NEM_OLVASHATO = /^Ez a fájl nem olvasható ármentésként\. Válaszd a „Mentés fájlba” gombbal készült \.json fájlt\.$/;
const NEM_MENTES = /^Ez nem a dentÁl árlista mentése\. Válaszd a „Mentés fájlba” gombbal készült \.json fájlt\.$/;
const SERULT = [
  ['hibás JSON („{bad”)', '{bad', NEM_OLVASHATO],
  ['félbevágott mentés', egyMentes.slice(0, Math.floor(egyMentes.length / 2)), NEM_OLVASHATO],
  ['üres fájl', '', NEM_OLVASHATO],
  ['bináris szemét', Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x89, 0x50, 0x4e, 0x47]), NEM_OLVASHATO],
  ['tömb a gyökérben', '[]', NEM_MENTES],
  ['szám a gyökérben', '42', NEM_MENTES],
  ['null', 'null', NEM_MENTES],
  ['más alkalmazás mentése', JSON.stringify({ alkalmazas: 'mas', orvosok: [], tetelek: [] }), NEM_MENTES],
  ['az orvosok nem tömb', JSON.stringify({ alkalmazas: 'dentAl-arlista', orvosok: 'Peti', tetelek: [] }), NEM_MENTES],
  ['a belső tároló formátuma (dentAl.adatok.v1)', JSON.stringify(adatok()), NEM_MENTES],
  ['üres mentés (nincs orvos, nincs tétel)', JSON.stringify({ alkalmazas: 'dentAl-arlista', formatum: 1, orvosok: [], tetelek: [] }), /^A mentésben nincs orvos vagy tétel, ezért nem tölthető be\. Válassz másik mentést\.$/],
  ['csak érvénytelen nevek', JSON.stringify({ alkalmazas: 'dentAl-arlista', formatum: 1, orvosok: ['', 5, null], tetelek: [{ nev: '' }, null] }), /^A mentésben nincs orvos vagy tétel/],
  ['túl sok orvos', JSON.stringify({ alkalmazas: 'dentAl-arlista', formatum: 1, orvosok: Array.from({ length: 501 }, (_, i) => 'O' + i), tetelek: [{ nev: 't', arak: {} }] }), /^Túl sok orvos vagy tétel \(legfeljebb 500 orvos és 5000 tétel tölthető be\)\.$/],
  ['túl nagy fájl (6 MB)', Buffer.alloc(6 * 1024 * 1024, 0x20), /^A fájl túl nagy egy ármentéshez\. Válaszd a „dental_arak_…json” fájlt\.$/]
];
for (const [cim, tartalom, uzenet] of SERULT) {
  test(`sérült mentés — ${cim}: érthető üzenet, semmi nem íródik felül`, async ({ page }) => {
    await nyit(page, { adat: gazdagAdat(), valasztas: { orvosId: 'o1', menny: { t1: 2 }, datum: null }, beall: { nullazas: false }, ido: IDO });
    await arakMegnyit(page);
    const elotte = await taroloPillanat(page);
    const d = await visszatolt(page, jsonFajl(tartalom));
    await expect(d.locator('#dlgCim')).toHaveText('A mentés nem tölthető be');
    expect(ny(await d.locator('#dlgLeiras').innerText())).toMatch(uzenet);
    await dlgGomb(page, 'Rendben').click();
    await dlgZarva(page);
    expect(await taroloPillanat(page)).toEqual(elotte);
  });
}

test('érvénytelen árak a mentésben: kimaradnak, és az előnézet figyelmeztet rájuk', async ({ page }) => {
  await nyit(page, { adat: adatok(), ido: IDO });
  await arakMegnyit(page);
  const j = { alkalmazas: 'dentAl-arlista', formatum: 1, orvosok: ['Peti', 'Dani', 'Anna'], tetelek: [{ nev: 'tetel1', arak: { Peti: '12500', Dani: -5, Anna: 7650 } }] };
  const d = await visszatolt(page, jsonFajl(JSON.stringify(j)));
  await expect(d.locator('.figyelmeztetes')).toContainText('tetel1 · Peti: „12500” nem érvényes ár, kimarad.');
  await expect(d.locator('.figyelmeztetes')).toContainText('tetel1 · Dani: „-5” nem érvényes ár, kimarad.');
  await dlgGomb(page, 'Mégse').click();
});

test('újabb formátumú mentés (formatum: 2): figyelmeztet, hogy betöltés után ellenőrizze az árakat', async ({ page }) => {
  await nyit(page, { adat: adatok(), ido: IDO });
  await arakMegnyit(page);
  const j = JSON.parse(egyMentes); j.formatum = 2;
  const d = await visszatolt(page, jsonFajl(JSON.stringify(j)));
  await expect(d.locator('.figyelmeztetes')).toContainText('A mentés az alkalmazás újabb változatából származik; betöltés után ellenőrizd az árakat.');
  await dlgGomb(page, 'Mégse').click();
});

test('[FUN-07] csak kis/nagybetűben eltérő dupla orvosnév a mentésben nem lesz két külön orvos', async ({ page }) => {
  await nyit(page, { adat: adatok(), ido: IDO });
  await arakMegnyit(page);
  const j = { alkalmazas: 'dentAl-arlista', formatum: 1, orvosok: ['Anna', 'anna', 'Péter', 'Peter'], tetelek: [{ nev: 'Korona', arak: { Anna: 100, anna: 200, Péter: 300, Peter: 400 } }, { nev: 'korona', arak: { Anna: 1 } }] };
  const d = await visszatolt(page, jsonFajl(JSON.stringify(j)));
  await d.locator('.dlg-lab button').last().click();
  await dlgZarva(page);
  const a = await taroltAdat(page);
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  expect(new Set(a.orvosok.map(o => norm(o.nev))).size, 'az alkalmazás máshol (új orvos, Excel, link) ezeket ugyanannak a névnek veszi').toBe(a.orvosok.length);
  expect(new Set(a.tetelek.map(t => norm(t.nev))).size).toBe(a.tetelek.length);
});
