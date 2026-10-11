# Tesztjelentés — dentÁl árlista 1.7.0

A dentÁl árlista-generáló (`index.html`) teljes körű tesztelése és hibajavítása. Kiinduló változat: **1.6.0**. A javított változat: **1.7.0**.

## Összefoglaló

- **Mit teszteltem:**
  - statikus kódellenőrzés (biztonság, XSS, tárolás, CDN);
  - funkcionális tesztek;
  - PDF-tesztek;
  - mobil és böngésző;
  - akadálymentesség;
  - teljesítmény.
- **Tesztcsomag:** 383 automatizált Playwright-teszteset a `tests/` mappában, mindegyik 6 változatban: Chromium és WebKit (az iOS Safari motorja) × 375×812, 360×740 és 1280×800, összesen 2298 futás.
- **Hibák:**
  - A feltárás 46 leletet hozott; független ellenőrzés után 43 valós, 3 cáfolt. Kritikus nem volt, 11 fontos, 32 apró. Mind a 43 javítva.
  - A javítások ellenséges átnézése további 13 apró hibát talált; ezek is javítva.
- **Végeredmény:** A végső teljes futás az összes javítás után: **2298/2298 zöld**, 0 piros, 0 ingadozó, 0 kihagyott (33 perc, 8 szálon). A korábbi körök Python-alapú regressziós próbái is zöldek: bemondás, link, GitHub-mentés, Gmail, végső PDF-ellenőrzés, a bemondás végellenőrzése.
- **Valódi eszköz:** valódi telefonon és nyomtatón nem próbáltam. Ehhez nem volt eszközöm; a telefonokat emulációval, a nyomtatást a PDF képpé alakításával és szürkeárnyalatos elemzéssel teszteltem (lásd lent: [Korlátok](#korlátok)).

## Környezet

| | |
| --- | --- |
| Gép | Windows 11 Pro (10.0.26200), 16 logikai mag |
| Futtató | Node.js 24.14.0, Playwright 1.63.0 (`@playwright/test`) |
| Böngészők | Chromium 153.0.8010.12, WebKit 26.6 (a Playwright Windows-os WebKitje; az iOS Safari motorja) |
| Nézetek | 375×812 és 360×740 mobil (érintés, DPR 2; Chromiumban Pixel 7, WebKitben iPhone 13 felhasználói ügynökkel), 1280×800 asztali |
| Nyelv, időzóna | hu-HU, Europe/Budapest |
| Akadálymentesség | axe-core 4.10 (`@axe-core/playwright` 4.10.2), szabályok: WCAG 2.0 / 2.1 A és AA |
| PDF-elemzés | az alkalmazás saját pdf.js 3.11.174-e (szöveg, betűk, képpé alakítás), saját nyers PDF-elemzés (mint a `pdffonts`), pypdf 6.19 keresztellenőrzés. Poppler (`pdfinfo`, `pdffonts`, `pdftoppm`) nincs a gépen, ezért ezek kiváltva |
| CDN-könyvtárak | a tesztek a `tests/.cache/` helyi, SRI-vel ellenőrzött másolatából kapják (determinisztikus, internet nélkül is fut); minden más külső kérés tiltva |

## A tesztelés menete

1. **Tesztkeret.** `tests/` mappa, `npm test`; az `index.html` önálló maradt.
2. **Feltárás.** Négy terület párhuzamosan, mindegyik saját tesztfájlokkal:
   - biztonság, tárolás és offline;
   - funkcionális;
   - PDF és teljesítmény;
   - mobil és akadálymentesség.

   Minden hibára készült teszt. A teszt a **helyes** viselkedést várja el, ezért a javításig piros.
3. **Független ellenőrzés.** Minden területet egy második, cáfolásra utasított ellenőr nézett át:
   - újra előidézte a hibákat;
   - felülvizsgálta a súlyosságot;
   - kijavította a hibás vagy ingadozó teszteket;
   - pótolta a hiányzó eseteket.

   3 leletet cáfolt, és 4 új hibát talált.
4. **Javítás.** A forrásban (`_fejlesztes/uj/`), utána újraépített `index.html`.
5. **Teljes csomag újra.** Minden javítás után: 2 teljes futás, 6 projekten.
6. **Ellenséges kódátnézés.** A javításokat még egyszer, három nézőpontból néztük át:
   - adatok és logika;
   - PDF, Worker és CSP;
   - felület és fókusz.

   19 lelet jött; a cáfoló ellenőrzés után 13 maradt, mind apró, mind javítva (lent).

## Talált hibák

Az azonosító előtagja a területet jelöli:
- KOD: statikus kódellenőrzés;
- BIZ: biztonság;
- TAR: tárolás;
- OFF: offline és CDN;
- FUN: funkcionális;
- PDF: PDF;
- TEL: teljesítmény;
- MOB: mobil;
- A11Y: akadálymentesség.

Az „-E” végű leleteket a független ellenőr találta. Minden hibához van automatizált teszt (a cím elején az azonosító), ami a javítás előtt piros volt, most zöld.

### Kritikus

Nem volt. Pénzösszeget csendben elrontó, adatot elvesztő vagy biztonsági rést nyitó hiba nem maradt. XSS-t egyetlen bemeneti úton sem találtunk:
- a szerkesztő;
- az Excel-import;
- a JSON-visszatöltés;
- a link;
- a GitHub-listák;
- a bemondás.

### Fontos (11)

**FUN-02 · Tizedes mennyiség: gépelve a „2,5”-ből 25 db lett**
- *Hiba:* A mezőből gépelés közben eltűnt a vessző, így a következő számjegy hozzáragadt: tízszeres mennyiség és összeg. Beillesztve viszont 2 db lett, üzenet nélkül.
- *Reprodukálás:* Peti → tetel1 mezőjébe billentyűnként: `2`, `,`, `5` → 25 db, 250 000 Ft.
- *Javítás:*
  - a mező szövege gépelés közben nem íródik át;
  - a tizedesből az egész rész lesz, és üzenet jelzi: „A mennyiség csak egész szám lehet: 2 db lett beállítva.”
- *Állapot:* javítva. Teszt: `21-mennyisegek.spec.js › [FUN-02]` (kitöltés, beillesztés, gépelés × „2,5” és „2.5”).

**FUN-E1 · Lassan gépelt, végül hibás árnál „Az ár nem változott”, közben egy részérték mentődött**
- *Hiba:* Az Árak cella gépelés közben fél másodperc szünet után csendben mentette az addigi érvényes részt. Ha a végső szöveg hibás volt (pl. „1e9”), az üzenet azt mondta, hogy az ár nem változott, pedig 1 Ft maradt mentve.
- *Reprodukálás:* Árak → tetel1 · Peti (10 000): „1”, 1 mp szünet, „e9”, kilépés → az üzenet szerint nem változott, a cella 1 Ft.
- *Javítás:* hibás végső értéknél az ár visszaáll a mezőbe lépés előtti értékre, így az üzenet igaz.
- *Állapot:* javítva. Teszt: `22-arak-szamitas.spec.js › [FUN-E1]` (2 eset).

**PDF-01 · Szóköz nélküli hosszú tételnév letolta a lapról az Összesen oszlopot**
- *Hiba:* A Megnevezés oszlop a leghosszabb törhetetlen szóig tágult, és a számoszlopokat jobbra, a lapon túlra tolta. Kb. 45 karakter fölött ez történt, pl. egy Excelből jövő aláhúzásos név esetén; a sorösszegek ilyenkor levágva jelentek meg.
- *Reprodukálás:* tételnév „Fémkerámia_korona_implantátumra_csavarozott_titánbázissal_ŐŰ”, PDF.
- *Javítás:* a névoszlop rögzített szélességű (229,28 pt, ugyanannyi, mint eddig), a túl hosszú szó a cella szélén törik. A normál elrendezés és a férőhely nem változott.
- *Állapot:* javítva. Teszt: `30-pdf.spec.js › [PDF-01]`.

**TEL-03 · A háttérbeli PDF-előkészítés lassú telefonon másodpercekre lefagyasztotta a felületet**
- *Hiba:* A PDF a fő szálon készült. Egy oldalszámítás 4×-esen lassított processzoron 1,3–2,2 s; addig a koppintás, a ± gomb és a gépelés nem reagált, és ez minden mennyiségváltozás után 1,2 s-mal lefutott.
- *Javítás:*
  - A PDF egy háttérszálon (Web Worker) készül, a fő szál szabad marad.
  - Ha a Worker nem indul (régi böngésző, tiltás), a PDF a régi módon, a fő szálon készül. Ez automatikus tartalék, a felhasználó nem vesz észre különbséget.
- *Állapot:* javítva. Teszt: `50-teljesitmeny.spec.js › [TEL-03]`. A fő szál leghosszabb foglaltsága szimulált 1,5 s-os oldalszámítás mellett a javítás előtt 1,7–2,1 s volt, most < 0,5 s.

**TEL-01 · A „PDF készül…” jelzés csak a PDF elkészülte után rajzolódott ki**
- *Hiba:* A pörgő csak a nehéz munka után rajzolódott ki, addig a gomb fagyottnak látszott. 4×-esen lassított processzoron mennyiségváltozás után 1,2–2,4 s múlva jelent meg, 15 tételnél gyakorlatilag soha. Ugyanígy az Előnézet ablaka is.
- *Javítás:* a PDF-készítés előtt egy képkocka-szünet; a Worker miatt közben a szál sem foglalt.
- *Állapot:* javítva. Teszt: `50-teljesitmeny.spec.js › [TEL-01]` (letöltés és Előnézet). Az első képkocka most 13–25 ms-nál jön (WebKit).

**PDF-E1 · Dupla koppintás a „PDF letöltése” gombon visszaállította a nullázott mennyiségeket**
- *Hiba:* A kész panel a gomb helyére kerül. Telefonon pont ott van a „Mennyiségek vissza”, asztalon az „Új árlista”, így a második koppintás ezt nyomta meg. A felhasználó azt hihette, hogy a PDF nem készült el.
- *Javítás:* a panel megjelenése utáni 1 s-ban az előző koppintás helyére (±32 px) érkező második koppintás nem számít.
  - Ez a sávból, az Előnézet ablakából és a tartalék panelről indított műveletnél is így van.
  - Billentyűzetre nem vonatkozik, a máshová koppintásra sem.
- *Állapot:* javítva. Teszt: `50-teljesitmeny.spec.js › [PDF-E1]`.

**OFF-01 · Akadozó hálózaton az első PDF-készítés a végtelenségig pörgött**
- *Hiba:* A könyvtárak letöltésének nem volt időkorlátja. Ha a kapcsolat él, de nem jön adat, a gomb örökre „PDF készül…” maradt, újra sem lehetett próbálni. Ez első használatkor, mobilneten fordul elő.
- *Reprodukálás:* üres gyorsítótár, a pdfmake kérése nem kap választ → PDF letöltése.
- *Javítás:*
  - Tétlenségi időkorlát: 20 s adat nélkül. Amíg jön adat, lassú neten sem szakad meg.
  - Utána érthető üzenet: „A kapcsolat túl lassú vagy megszakadt; próbáld újra jobb térerőnél.”
  - A gomb újra használható.
- *Állapot:* javítva. Teszt: `12-offline.spec.js › [OFF-01]`.

**MOB-10 · A megosztás tiltása utáni „Koppints a Megosztás gombra” panel gombja hibát dobott**
- *Hiba:* JavaScript-hiba (TypeError) jött, és nem indult megosztás. iPhone-on ez a fő út: a Megosztás az elsődleges gomb, és ha a PDF-készítés alatt lejár a koppintás engedélye, ez a panel jön.
- *Javítás:* a kezelő a panel bezárása előtt olvassa ki, mit kell megosztani.
- *Állapot:* javítva. Teszt: `40-mobil.spec.js › [MOB-10]`.

**MOB-05 · A kereső találatlistája az alsó sáv alá lógott**
- *Hiba:* A lista alja a rögzített sáv mögé került; 360×740-en másfél találat látszott, az utolsó nem volt elérhető.
- *Javítás:*
  - A lista magassága a sáv tetejéig (és a billentyűzetig) ér.
  - Kevés helynél a keresősor a képernyő tetejére görgetődik.
- *Állapot:* javítva. Teszt: `40-mobil.spec.js › [MOB-05]`.

**MOB-04 · A bemondás eredményablakának választógombjai csak 32 px magasak voltak**
- *Hiba:* Egy később álló CSS-szabály felülírta a gombok méretét.
- *Javítás:* 48 px.
- *Állapot:* javítva. Teszt: `40-mobil.spec.js › … hangEredmeny`.

**MOB-E1 · Sok ár nélküli tételnél a sáv-üzenet eltakarta a képernyőt**
- *Hiba:* A sáv-üzenet minden ár nélküli tétel nevét felsorolta: 30 tételnél a képernyő 93%-át fedte, az orvosválasztó elérhetetlen lett. Ez akkor jön elő, ha egy új, még ár nélküli orvost választanak.
- *Javítás:*
  - Legfeljebb 3 név, „és még N tétel”.
  - A sáv-üzenet legfeljebb a képernyő 30%-a, görgethető.
- *Állapot:* javítva. Teszt: `40-mobil.spec.js › [MOB-E1]`.

### Apró (32)

**Mennyiség és ár (FUN)**
- **FUN-01 · Negatív mennyiségből pozitív lett (−5 → 5 db), üzenet nélkül.** *Javítás:* a negatív számot nem fogadja el (a mennyiség marad, üzenet jelzi). *Javítva*, `21-mennyisegek › [FUN-01]` (6 eset).
- **FUN-03 · Szöveg más számmá vált („1e3” → 13, „0x10” → 10, az „abc” egy meglévő 5 db-ot nullázott).** *Javítás:* a nem szám bevitel nem változtat a mennyiségen, üzenet jelzi. *Javítva*, `21-mennyisegek › [FUN-03]` (7 eset).
- **FUN-04 · A „0,500” ár 500 Ft lett (ezres tagolásnak vette).** *Javítás:* 0-val kezdődő csoport nem ezres tagolás → 0,5 Ft; az „1,500” továbbra is 1500 Ft. *Javítva*, `22-arak-szamitas › [FUN-04]`.
- **FUN-E2 · A magyar írásmódú árat („10.000,50”, „12.500,- Ft”) elutasította.** *Javítás:* elfogadja (ezres pont, tizedesvessző, „,-” végződés), az Excel szöveges celláiban is. *Javítva*, `22-arak-szamitas › [FUN-E2]`.
- **FUN-05 · Éjfél után a nyitva hagyott lapon a dátum „tegnap (ma)” maradt, a PDF viszont már a mai dátummal készült.** *Javítás:* napváltás-ellenőrzés minden műveletnél és percenként. *Javítva*, `24-nullazas-sorszam-fajlnev › [FUN-05]`.
- **FUN-06 · A JSON-mentésből kimaradtak a bemondás „Más nevek” listái.** Másik telefonra visszatöltve elvesztek. *Javítás:* a mentés tartalmazza őket, a visszatöltés visszahozza (akkor is, ha csak ezek térnek el). *Javítva*, `27-json-mentes › [FUN-06]` (2 eset).
- **FUN-07 · A JSON-visszatöltés átengedte a csak kis- és nagybetűben vagy ékezetben eltérő dupla neveket („Anna” és „anna”).** *Javítás:* egy névvel tölti be, mint az Excel és a link, és az előnézet figyelmeztet. *Javítva*, `27-json-mentes › [FUN-07]`.

**Tárolás és mentés (TAR)**
- **TAR-01 · A 120 karakternél hosszabb nevű orvos minden ára csendben elveszett mentés–visszatöltéskor és linknél.** *Javítás:*
  - A visszatöltés a rövidített névhez is megtalálja az árakat és az e-mailt.
  - Az Excel-import a túl hosszú nevet (orvos > 120, tétel > 200 karakter) hibaként jelzi.

  *Javítva*, `11-tarolas › [TAR-01]` (fájl és link).
- **TAR-02 · Érvénytelen tárolt dátumnál (pl. 2026-02-30) a mai napot „nem mai”-nak jelezte.** *Javítás:* naptári ellenőrzés. *Javítva*, `11-tarolas › [TAR-02]`.
- **TAR-03 · Egyetlen hibás tárolt rekord miatt az egész ártábla a mintaadatokra cserélődött.** *Javítás:* a hibás rekord kimarad, a többi orvos, tétel és ár megmarad; az eredeti külön kulcson megmarad, az üzenet pontos. *Javítva*, `11-tarolas › [TAR-03]` (3 változat).

**Biztonság és kód (BIZ, KOD)**
- **BIZ-02 · A tartalombiztonsági szabály (CSP) engedte volna egy befecskendezett inline eseménykezelő futását.** Élő XSS-rés nincs; ez mélységi védelem, mert a GitHub-kulcs ugyanabban a tárolóban van. *Javítás:* szkript csak `nonce="dentAl"` jelöléssel fut, így egy HTML-be csempészett `onerror` sem fut le. A CONFIG szerkesztése változatlan. *Javítva*, `10-biztonsag › [BIZ-02]`.
- **BIZ-03 · Az SRI-ellenőrzés ismeretlen algoritmusnál vagy hiányzó ellenőrzőösszegnél átengedett.** *Javítás:* ilyenkor nem futtatja a fájlt. *Javítva*, `12-offline › [BIZ-03]`.
- **KOD-02 · A párbeszédablak gombjából nyitott új ablakot a gomb rögtön bezárta.** Túlcsorduló listánál az Előnézet „PDF letöltése” gombja után a „Nem fér el egy oldalon” ablak villant. *Javítva*, `10-biztonsag › [KOD-02]`.
- **KOD-03 · A fájlnév 80 karakteres vágása félbevághatott egy emojit (hibás fájlnév).** *Javítás:* grafémánként vág. *Javítva*, `10-biztonsag › [KOD-03]`.
- **KOD-04 / PDF-02 · Emoji, irányjel és a betűben nem szereplő jel (pl. ⌀) üres négyzetként került a PDF-be.** *Javítás:* a PDF-be csak a betű (IBM Plex Sans) jelei kerülnek, ezeket a betűfájlból olvassa. A ® ™ Ø és az ékezetek maradnak, a ⌀ helyett Ø, az emoji kimarad. *Javítva*, `10-biztonsag › [KOD-04]`, `30-pdf › [PDF-02]`.
- **KOD-05 · Hosszú, szóköz nélküli tételnév a sáv-üzenetben kitolta a képernyőről a PDF-gombot.** Már egy 38 karakteres összetett szó is elég volt telefonon. *Javítás:* tördelés a sávban, az értesítésekben és a címkéken. *Javítva*, `10-biztonsag › [KOD-05]` (2 eset).
- **KOD-06 · Halott kód (`mentettCache`, egy használatlan változó).** *Törölve.* Viselkedési hatása nem volt, ezért teszt nincs rá.

**Teljesítmény (TEL)**
- **TEL-02 · Az Előnézet ablak „PDF letöltése” / „Megosztás” gombja után semmi nem jelezte, hogy a PDF készül.** A sáv gombja közben némán nem reagált. *Javítás:* a sáv gombja mutatja a „PDF készül…” jelzést; ha közben újra megnyomják, „A PDF már készül…” üzenet jön. *Javítva*, `50-teljesitmeny › [TEL-02]`.

**Mobil (MOB)**
- **MOB-01, MOB-02, MOB-03 · 44 px magas gombok (a követelmény 48 px):**
  - a „Csak a kiválasztottak” szűrő;
  - a GitHub-súgó fejléce;
  - a beépített böngésző figyelmeztetésének „Link másolása” gombja.

  *Javítás:* 48 px. *Javítva*, `40-mobil › [MOB-01/02/03]`.
- **MOB-07 · Safariban Tab-bal (iPhone-on a billentyűzet „következő” nyilával) a fókuszált mennyiségmező a sáv mögé került.** *Javítás:* a fókuszált elem a sáv, a keresősor és a billentyűzet fölé görgetődik. *Javítva*, `40-mobil › [MOB-07]`.
- **MOB-09 · Shift+Tab-bal a fókuszált mező a ragadós keresősor alá került.** *Javítás:* a görgetési margó számol a keresősorral. *Javítva*, `40-mobil › [MOB-09]`.
- **MOB-11 · Gmail-megosztás tiltásakor a szöveg a Gmail gombot kérte, de a fókusz a Megosztásra került.** *Javítva*, `40-mobil › [MOB-11]`.
- **MOB-12 · Asztali Safariban a mennyiségmezőre kattintva a régi érték nem maradt kijelölve (3 → 37).** *Javítva*, `40-mobil › [MOB-12]`.

**Akadálymentesség (A11Y)**
- **A11Y-01 · axe „list” (súlyos): a csoportcím `<li role="presentation">` volt.** *Javítás:* címsor szerep. *Javítva*, `41-akadalymentesseg › [A11Y-01]` (4 állapot).
- **A11Y-02 · A szövegmezők fókuszjelzése alig látszott (1,06–1,14:1 kontraszt).** *Javítás:* 2 px-es zöld keret. *Javítva*, `[A11Y-02]`.
- **A11Y-03 · A „Válassz orvost” hibát a képernyőolvasó nem jelentette be.** *Javítás:* élő régió, a csoport hivatkozik rá, `aria-invalid`. *Javítva*, `[A11Y-03]`.
- **A11Y-04 · Az Árak nézet „Árlista” gombjának neve „Vissza az árlistához” volt (a látható szó nem volt benne).** *Javítva*, `[A11Y-04]`.
- **A11Y-05 · Billentyűzettel PDF-et kérve a fókusz elveszett (a lap elejére került), a kész panel nem kapta meg.** *Javítva*, `[A11Y-05]`.
- **A11Y-06 · A görgethető ablaktartalom billentyűzettel nem volt görgethető (Safari; axe: scrollable-region-focusable).** *Javítva*, `[A11Y-06]`.

### Cáfolt leletek (nem hiba)

- **BIZ-01 · SheetJS 0.18.5 ismert hibákkal (CVE-2023-30533, CVE-2024-22363).** Dokumentált, vállalt korlát. A README „Ismert korlátok” része leírja, és csak a saját, megbízható Excel-fájlt szabad betölteni. A javított változat csak a SheetJS saját CDN-jén van. A javasolt helyi másolat eltörné a „fájlként a telefonra küldve” módot. A teszt azt őrzi, hogy a README ezt továbbra is kimondja.
- **MOB-06 · A link-mező 14 px-es betűje miatti iOS-nagyítás.** A mező csak olvasható, ott nem jön fel billentyűzet és nincs nagyítás.
- **MOB-08 · A feljövő billentyűzet eltakarja a mezőt.** Az emuláció nem volt valószerű. Valódi böngészőben a fókuszált mező magától a látható részbe görgetődik; ezt a teszt most utánozza, és zöld.

### A javítások ellenséges átnézésének leletei (javítva)

A kész javításokat három nézőpontból még egyszer átnéztük: adatok és logika, PDF/Worker/CSP/offline, felület és fókusz. 19 lelet jött, a cáfoló ellenőrzés után 13 maradt; mind apró, mind javítva. Ebből egy a dupla koppintás elleni védelem bővítése, ez a PDF-E1-nél szerepel. A többi:
- **Ár:** a „12.500,– Ft” (nagykötőjellel) is elfogadott.
- **Más nevek visszatöltése:**
  - a mentésből visszatöltött név egy másik tételtől elkerül („egy kifejezés csak egy tételé”);
  - az Árak lap „Visszaállítás” gombja ezeket is visszaállítja.
- **PDF-fejléc:** a telefonszám és az e-mail közti elválasztó nem szűkül össze.
- **PDF-szöveg:**
  - a betűben nem szereplő jelnek a kompatibilis alakja kerül a helyére („℃” → „°C”, „～” → „~”, „㎜” → „mm”, „∅” → „Ø”);
  - a láthatatlan formázójelek (ZWJ stb.) nem hagynak üres helyet.
- **Időkorlátok:** a háttérben (más appra váltva) töltött idő nem számít bele. Visszatéréskor nincs hamis „túl lassú a kapcsolat”, és a háttérszál sem kapcsol ki.
- **Előnézet:** elakadt letöltésnél nem a „még nincs letöltve” szöveg jelenik meg.
- **Görgetés:**
  - A keresősor miatti felső görgetési margó a keresősor saját mezőinél ugrást okozott; helyette a lista elemeit a fókusz-igazítás kezeli.
  - Az igazítás felső határa nem számolja kétszer a látható nézet eltolását.
  - Érintéssel fókuszált ± gombnál nincs görgetés, így a gyors koppintások nem csúsznak el.
  - A „Adj meg mennyiséget” utáni sima görgetést sem szakítja meg.
- **Orvos-hibaüzenet:** a rejtett hibaüzenetet a képernyőolvasó nem olvassa fel a javítás után.
- **„A PDF már készül…”:** sárga figyelmeztetés (nem piros hiba), és a kész panel megjelenésekor eltűnik.
- **Billentyűzetes fókusz:** hibánál és a „Nem fér el” ablaknál is visszakerül a PDF-gombra.

A 6 cáfolt lelet:
- Az „1.000” mennyiség 1 db lesz: pontot ezres tagolásként darabszámnál senki nem ír; a tizedesnél az üzenet jelzi.
- A „db” betűnkénti gépelése.
- A FUN-07 összevonásnál a második írásmód árai: a JSON-hoz kézi szerkesztés kell.
- A háttérbe kerüléskori csendes ármentés: 1.6.0-s, szándékos viselkedés.
- A Worker-hiba utáni leállás: már most leáll.
- A betelt tárhely ismételt próbálkozása.

### A tesztkeret saját hibái (javítva)

Az ellenőrök a közös tesztkeretben is találtak három hibát:
- WebKitben a blob-címeket is elfogta, ezért ott az app mindig a tartalék betöltési úton futott;
- a `pdfKesz()` nem várt;
- a `tests/kimenet/` alatti segédfájlok is lefutottak.

Mindhárom javítva.

## Amit szándékosan nem javítottam

| Mi | Miért nem |
| --- | --- |
| SheetJS 0.18.5 ismert hibái (BIZ-01) | Dokumentált korlát (README, „Ismert korlátok”): csak saját, megbízható Excel-fájlt tölts be. A javított SheetJS csak a gyártó saját CDN-jén van, amit a tartalombiztonsági szabály nem enged. Helyi másolatba sem tehető, mert a „fájlként a telefonra küldve” mód (csak az `index.html`) akkor nem működne. |
| A GitHub-kulcs titkosítatlanul a böngésző tárolójában | Szerver nélküli alkalmazásnál nincs jobb hely. A kockázatot csökkenti, hogy nincs XSS (tesztelve), a CSP csak a GitHub API-t engedi, és most már inline eseménykezelő sem futhat (BIZ-02). |
| pdf.js 3.11 (CVE-2024-4367) | Csak `isEvalSupported: true` mellett használható ki; az alkalmazás `false`-szal hívja, és csak saját PDF-et rajzol. |
| A sérült tárolt adat külön másolata (`dentAl.serult.*`) a felületről nem tölthető le | Csak sérült tárolónál fordul elő, és a TAR-03 javítása óta egy hibás rekord már nem viszi el a többi adatot. Új gomb kellene hozzá egy szinte soha elő nem forduló esetre. |
| A GitHubra mentett árak (`arak/arak.json`) nem tartalmazzák a bemondás „más neveit” | A JSON-mentés (fájl) tartalmazza őket (FUN-06). A GitHub-formátum bővítése a több eszköz közötti szinkront is érintené; külön kérésre megcsinálom. |
| Az első betöltés kb. 4,1 MB (a CDN tömörítésével kb. 1,06 MB), az offline-tár 3,75 MB | Az offline működéshez kell: PDF-készítő, Excel-olvasó, előnézet és két betűfájl. A két 200 KB-os betűfájl latin részhalmazzal kb. 300 KB-tal csökkenthető lenne, de minden kiírható jel a betűből jön; a nyereség kicsi a kockázathoz képest. A PDF-be már most is csak a felhasznált jelek kerülnek (20–25 KB-os PDF). |
| Az egyszínű logó sötétkék (#1E3A4C), nem fekete | Az ügyféltől kapott eredeti egyszínű logó is ilyen; szürkeárnyalatban kb. 79%-os sötétszürke, jól nyomtatható. |
| A zebracsík szürkében csak 4,2%-os tónus | Látható (a 3%-os küszöb felett), és kevés festéket visz el, ami cél volt. |
| Szélsőséges összegnél (10 milliárd Ft fölött) a szám belelóg a cella belső margójába | Abszurd érték; a számok ekkor sem fedik egymást, a 9 999 db × 99 999 999 Ft is elfér. |
| A kész panelen a hosszú fájlnév a dátum közepén törik | Kozmetikai: a szöveg teljes, nem lóg ki. |
| Excel-importnál az átnevezett orvos vagy tétel újként, a régi törlődőként látszik | Szándékos, a README leírja: a párosítás név szerint történik. |
| Új eszközön a JSON-visszatöltés a mintaadatokat (Peti, Dani, Anna) piros „törlődik” gombbal mutatja | Helyes (tényleg törlődnek), csak riasztó. |
| Nincs `frame-ancestors` (kattintáseltérítés elleni védelem) | Meta-CSP-ben nem hat, a GitHub Pages nem enged saját fejlécet; az alkalmazásban nincs egykattintásos veszélyes művelet. |
| Az e-mail-ellenőrzés átenged pl. `<script>@x.hu` alakot | Az e-mail csak URL-kódolva a Gmail-linkbe és mezőértékként kerül, HTML-be soha. |

## Döntések: mi a helyes viselkedés

- **Mennyiség:**
  - 0 és 9 999 közötti egész szám.
  - Elfogadott alakok: szóköz a számjegyek között („1 000”), „db” utótag („3 db”), teljes szélességű számjegy.
  - Üres mező = 0.
  - 9 999 fölött 9 999 lesz, üzenettel.
  - Tizedesnél az egész rész lesz a mennyiség, üzenettel („csak egész szám lehet: 2 db lett beállítva”). A fogtechnikai tételek egész darabok; a csendes levágás elrejtené az elírást, a felfelé kerekítés pedig növelné az összeget.
  - Negatív szám és betű: a mennyiség nem változik, üzenet jelzi; a mező elhagyásakor a tárolt érték látszik.
  - A −/+ gomb 0-nál, illetve 9 999-nél tiltott.
- **Ár (forint):**
  - Legfeljebb 2 tizedes (fillér), a 0 Ft érvényes ár, az üres mező = nincs ár.
  - Ezres tagolásként a szóköz, a pont és a vessző is jó; tizedesként a vessző és a pont.
  - A háromjegyű csoport ezres tagolás („1,500” = 1500 Ft), kivéve, ha 0-val kezdődik („0,500” = 0,5 Ft).
  - Magyar írásmód is jó: „10.000,50”, „12.500,- Ft”.
  - Elutasítva, az ár nem változik és üzenet jelzi: negatív szám, betű, kitevős alak, 99 999 999 Ft fölötti érték.
- **Kerekítés:** a sorösszeg a mennyiség és az ár szorzata 2 tizedesre kerekítve, a végösszeg a sorösszegek kerekített összege. Lebegőpontos hiba sehol nem látszik: a 0,1 + 0,2 = 0,3 Ft a sávban és a PDF-ben is. A 99 999 999 Ft × 9 999 db pontosan, kitevő nélkül jelenik meg.
- **Tétel törlése:** az árai és a beírt mennyisége is törlődik (a megerősítés kiírja, hány ár).
- **Átnevezés:** az azonosító marad, így a kiválasztás, a mennyiségek és az árak megmaradnak, a PDF az új nevet írja.
- **A kiválasztott orvos törlése:** nincs kiválasztott orvos, a mennyiségek maradnak.
- **Dupla és üres név:** dupla névnek számít a kis- és nagybetűben, ékezetben vagy szóközben eltérő név is („Már van ilyen nevű orvos/tétel.”); üres névnél „Adj meg egy nevet.”.
- **Fájlnév:** `Arlista_<Orvos>_<ÉÉÉÉ-HH-NN>.pdf`.
  - A szóköz helyett „_”, az ékezet marad, a fájlnévben tiltott jelek kimaradnak.
  - Például „Dr. Szűcs Ádám” → `Arlista_Dr._Szűcs_Ádám_2026-10-10.pdf`, a PDF-en „Címzett: Dr. Szűcs Ádám” (nem „Dr. Dr.”).
- **Nullázás és sorszám:**
  - A nullázás a sikeres letöltés vagy megosztás után történik; a CONFIG `nullazasGeneralasUtan` és az Árak lap kapcsolója kapcsolja. A „Mennyiségek vissza” visszahozza.
  - A megszakított megosztás nem nulláz, és nem fogyaszt sorszámot.
  - A sorszám a kiválasztott napé, naponta 01-től indul. Az előnézet nem foglal sorszámot, dupla kattintásra is csak egy fogy.
- **JSON-mentés tartalma:**
  - Benne van: orvosok (e-maillel), tételek (csoporttal), árak, beállítások, a bemondás más nevei.
  - Szándékosan nincs benne: a GitHub-kulcs (titok) és a napi sorszám-számláló (eszközönként fut).

## Mérések

| Mérés | Eredmény |
| --- | --- |
| PDF 1, 4, 15, 30, 40 tétellel | Mindig pontosan 1 oldal, A4 álló (595,28 × 841,89 pt); minden tétel, sorösszeg és végösszeg helyes. A betűméret 1–15 tételnél 10 pt, 30-nál 8 pt, 40-nél 7,5 pt. |
| Hol kezdődik a túlcsordulás | Rövid, egysoros nevekkel 45 tétel fér el; két-háromsoros nevekkel 25; csoportokkal és néhány hosszú névvel 39. 60 tételnél figyelmeztetés a sávban és ablakban („legfeljebb N fér el”); PDF nem készül, sorszám nem fogy. |
| Betűk (mint a `pdffonts`) | IBM Plex Sans Regular és SemiBold. Beágyazott részhalmazok, ToUnicode-dal: 6,5 KB + 4,4 KB a 200 KB-os betűfájlokból. Az ő ű Ő Ű á é helyes a tételnévben, a címzettben, a lábjegyzetben és a metaadatokban. A nem törő szóköznek saját, üres jele van. |
| Kijelölhető, kereshető szöveg | 0 kép a PDF-ben, a logó vektoros; minden felirat szövegként kereshető. |
| Logó | 45 mm széles, nem torzult (az arány eltérése < 1,5%), a fog zárt fehér folt a zöld Á-ban. Egyszínű változatban nincs zöld képpont. |
| Igazítás | A számoszlopok jobb szélei 0,5 pt-on belül egyeznek; a hosszú nevek a névoszlopban tördelődnek, nem érnek a számokhoz. |
| Szürkeárnyalatos nyomtatás | Zebracsík: 4,2%-kal sötétebb a fehérnél (L = 0,958). Elválasztó vonal L = 0,144, fejléc-vonal L = 0,579. Tintafedés 2,3% (színesen 2,2%). |
| PDF-méret | 1 tétel 19,9 KB, 15 tétel 21,4 KB, 45 tétel 23,7 KB. |
| Lapsúly | `index.html` 351 KB (brotlival 99 KB). Első betöltés 4,1 MB, a CDN tömörítésével kb. 0,8–1,1 MB. Az offline-tár (IndexedDB) 3,75 MB. |
| PDF-készítés, Chromium, 4× lassított CPU | Medián, 3 ismétlés, 8 párhuzamos tesztszál terhelése mellett. Előkészített PDF (a szokásos eset): 10–50 ms; 60 tételnél a „nem fér el” ablak 0,2–0,4 s. Mennyiségváltozás után azonnal: 15 tétel 0,4–0,9 s, 45 tétel 1,0–1,6 s (javítás előtt 2,1–6,0 s), 60 tétel 2,3–3,4 s. Első használat (üres gyorsítótár): 2,9–6,3 s. |
| PDF-készítés, WebKit, lassítás nélkül | Előkészítve 2–10 ms. Változás után: 15 tétel 0,2–0,5 s, 45 tétel 0,35–0,7 s, 60 tétel 0,7–1,9 s. Első használat 0,9–3,5 s. |
| Töltésjelzés | Minden 2 s-nál hosszabb útnál „PDF készül…” felirat pörgővel. Az első képkocka a kattintás után WebKitben 20–100 ms. Chromiumban 4×-es lassítással 0,15–0,7 s, a javítás előtt 1,2–2,4 s volt. |
| A felület akadása PDF-készítés közben | Szimulált lassú telefonon (1,5 s-os oldalszámítás) a fő szál leghosszabb foglaltsága < 0,5 s; a javítás előtt 1,7–2,1 s volt. |
| Elrendezés (20 állapot × 6 nézet, plusz 320 px) | Nincs vízszintes görgetés, kilógás vagy levágott szöveg; az alsó sáv nem takar tartalmat; minden érintési cél legalább 48 px. |
| Akadálymentesség (axe-core) | 20 állapotban, nyitott ablakokkal is: 0 WCAG 2.0/2.1 A/AA szabálysértés. |

## Korlátok

- **Valódi eszköz és nyomtató.**
  - A telefonokat Playwright-emulációval teszteltem: Chromium Android-, illetve WebKit iPhone-felhasználói ügynökkel, érintéssel, DPR 2-vel.
  - A Windows-os WebKit az iOS Safari motorja, de nem azonos vele.
  - A nyomtatást a PDF képpé alakításával és szürkeárnyalatos elemzéssel teszteltem.
  - Érdemes egyszer valódi telefonon is végigmenni: orvos → mennyiség → PDF → nyomtatás, és iPhone-on a Megosztás útján.
- **Virtuális billentyűzet és megosztási lap.** Playwrightban nincs ilyen: a billentyűzetet a nézet kicsinyítésével, a megosztást (`navigator.share`) utánzattal teszteltem, minden ágát (siker, megszakítás, tiltás).
- **CPU-lassítás.** Csak Chromiumban van; a WebKit-mérések lassítás nélküliek. A szimulált lassú telefon (1,5 s-os oldalszámítás) mindkét motorban fut.
- **Privát mód.** Az iOS privát módot letiltott, illetve betelt tárolóval modelleztem.
- **Fájlként megnyitva (file://).** Ez a mód, és a nem biztonságos `http://` cím sincs automatikusan tesztelve. A PDF-Worker blob-címről indul; ha egy böngésző ezt fájlként megnyitva nem engedi, az alkalmazás magától a régi, fő szálas úton készíti a PDF-et.
- **Fekvő tájolás.** Nem mértem külön (nem volt a kérésben).
- **Mérési zaj.** A párhuzamos futások miatt a gép erősen terhelt volt, ezért a teljesítményteszteknek csak robusztus korlátai vannak; a medián értékek tájékoztató jellegűek.

## A tesztek futtatása

```bash
npm install
npx playwright install chromium webkit
npm test
```

- Az első futáshoz internet kell (a CDN-könyvtárak letöltése és SRI-ellenőrzése a `tests/.cache/` mappába), utána internet nélkül is fut.
- Csak egy motor: `npm run test:chromium`, `npm run test:webkit`. Egy fájl, egy nézet: `npx playwright test tests/30-pdf.spec.js --project=webkit-375`.
- HTML-jelentés: `npm run test:jelentes`. Képernyőképek, renderelt PDF-oldalak, mérések: `tests/kimenet/`.
- A `vba.xlsm`-es tesztek csak akkor futnak, ha a fájl a `tests/fixtures/privat/` mappában van; ez a mappa nem kerül fel a GitHubra. Másold oda a makrós munkafüzetet.
- A teljes csomag 8 szálon kb. 33 perc ezen a gépen. A szálak száma a `PW_SZALAK` változóval állítható.
- Részletek fájlonként: [tests/README.md](tests/README.md).
