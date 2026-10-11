# Automatizált tesztek

Playwright-tesztek a dentÁl árlista-generálóhoz. Az `index.html` önálló marad, a tesztek nem kerülnek bele: ez a mappa csak kívülről nyitja meg és vezérli.

## Futtatás

Egyszer kell telepíteni (Node.js 18 vagy újabb):

```bash
npm install
npx playwright install chromium webkit
```

Utána a teljes csomag:

```bash
npm test
```

- Minden teszt 6 változatban fut: **Chromium** és **WebKit** (az iOS Safarit közelíti), mindkettő **375×812** és **360×740** mobilnézetben, valamint **1280×800** asztali nézetben.
- Az első futtatáshoz internet kell: a CDN-ről töltött könyvtárakat (pdfmake, IBM Plex, SheetJS, pdf.js) a `tests/.cache/` mappába menti, és ellenőrzi az SRI-ellenőrzőösszegüket. Utána a tesztek internet nélkül is futnak.
- Csak egy motor: `npm run test:chromium` vagy `npm run test:webkit`. Egy fájl vagy egy nézet: `npx playwright test tests/30-pdf.spec.js --project=chromium-375`.
- Eredmények: a konzolon, részletesen a `playwright-report/` mappában (`npm run test:jelentes`). A képernyőképek, a renderelt PDF-oldalak és a mérések a `tests/kimenet/` mappába kerülnek.
- A `vba.xlsm` importtesztje csak akkor fut, ha a fájl a `tests/fixtures/privat/` mappában van (ez a mappa nem kerül fel a GitHubra). Ha hiányzik, a teszt kihagyottként jelenik meg.

Környezeti változók (nem kötelezők): `PORT` (a tesztszerver portja, alapból 4173), `PW_SZALAK` (párhuzamos szálak, alapból 6).

## Fájlok

| Fájl | Mit tesztel |
| --- | --- |
| `00-alap.spec.js` | Füstpróba: orvos → mennyiség → egyoldalas A4 PDF |
| `10-biztonsag.spec.js` | XSS-próbák a nevekkel minden bemeneti úton (szerkesztő, Excel, JSON, link) |
| `11-tarolas.spec.js` | Letiltott vagy betelt tároló, sérült tárolt adatok |
| `12-offline.spec.js` | Elérhetetlen CDN, SRI-eltérés, offline későbbi indítás |
| `20`–`28-*.spec.js` | Funkcionális tesztek: alap folyamat orvosonként, mennyiségek, árak és kerekítés, hibaágak, nullázás, sorszám, fájlnév, Árak nézet, Excel-import, JSON-mentés, újratöltés |
| `30-pdf.spec.js` | PDF: oldalszám, A4, betűk, ékezetek, kijelölhető szöveg, logó, igazítás, mono logó, szürkeárnyalat |
| `40-mobil.spec.js` | Képernyőképek, vízszintes görgetés, kilógás, alsó sáv, gombméret, billentyűzet, Web Share |
| `41-akadalymentesseg.spec.js` | Billentyűzetes bejárás, fókusz, címkék, axe-core |
| `50-teljesitmeny.spec.js` | PDF-készítés ideje lassított CPU-n, töltésjelzés, oldal- és PDF-méret |
| `segito.js`, `cdn.js`, `pdfnezo.html`, `szerver.js` | A közös tesztkeret: megnyitás előre beállított adatokkal, CDN-másolat, PDF-elemzés pdf.js-sel, statikus szerver |
| `segito-biztonsag.js`, `segito-funkcio.js`, `segito-pdf.js`, `segito-mobil.js` | Területenkénti segédfüggvények (Excel- és JSON-fájlok készítése, PDF-mérések, képernyőállapotok, Web Share-utánzat) |
| `fixtures/excel/` | Kitalált adatokkal készült Excel-fájlok az importtesztekhez |
