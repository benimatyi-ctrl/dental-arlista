# dentÁl árlista

**Élő cím:** https://benimatyi-ctrl.github.io/dental-arlista/

Telefonon futó árlista-generáló a dentÁl számára. Kiválasztod az orvost, megadod a mennyiségeket, és egyoldalas A4-es PDF árlista készül, amit letölthetsz vagy egyből megoszthatsz. Kiváltja a `vba.xlsm` makróját.

## Fájlok

| Fájl | Mire való | Kötelező? |
| --- | --- | --- |
| `index.html` | Maga az alkalmazás: felület, logók, ikonok, minden kód egy fájlban. | Igen |
| `sw.js` | Internetes közzétételnél ettől nyílik meg az oldal internet nélkül is. | Ajánlott (GitHub Pages) |
| `manifest.webmanifest`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Kezdőképernyő-ikon és alkalmazásnév. | Ajánlott (GitHub Pages) |
| `dental-logo/` | A logó forrásfájljai (SVG és PNG). Az `index.html`-be már be vannak ágyazva. | Nem |
| `tests/`, `package.json`, `playwright.config.js` | Automatizált tesztek (lásd lent: [Tesztek](#tesztek)). A működéshez nem kellenek. | Nem |
| `TESZTJELENTES.md` | A legutóbbi teljes tesztelés jelentése. | Nem |

Az `index.html` egyedül is működik. A többi fájl csak akkor kell, ha az oldalt GitHub Pages-en teszed közzé.

A `dental-logo/` mappába csak az egyszínű logó (`dental-logo-mono.svg`, `.png`) érkezett meg. A színes `dental-logo.svg` és a `dental-mark.svg` ebből készült: a rajz ugyanaz, csak az Á csoport színe `#2F7D6D`, a jelnél pedig csak az Á látszik. Ha megvan az eredeti színes logó, cseréld le vele a mappában lévőt és az `index.html` `logo-szines` sablonjának tartalmát.

## Megnyitás telefonon

### Ajánlott: GitHub Pages

1. Hozz létre egy GitHub-tárolót (például `dental-arlista`), és töltsd fel bele az `index.html`-t, az `sw.js`-t, a `manifest.webmanifest`-et és a három PNG-ikont.
2. A tárolóban: **Settings → Pages → Branch: main / (root) → Save**. Pár perc múlva az oldal elérhető itt: `https://<felhasználónév>.github.io/dental-arlista/`.
3. Nyisd meg ezt a címet a telefonon, és várj pár másodpercet, amíg az első betöltés elmenti a szükséges fájlokat. Az **Árak** lapon az „Offline használat” résznél látod, ha végzett.
4. Tedd ki a kezdőképernyőre:
   - **iPhone (Safari):** Megosztás gomb → *Főképernyőhöz adás*.
   - **Android (Chrome):** ⋮ menü → *Hozzáadás a kezdőképernyőhöz* vagy *Alkalmazás telepítése*.
5. Ezután mindig a kezdőképernyő ikonjáról indítsd. Internet nélkül is működik.

> **iPhone-on fontos:** a kezdőképernyőre tett alkalmazás külön tárolót használ, mint a Safari. A Safariban beállított árak nem látszanak benne, ezért az árakat (Excel-import) már a kezdőképernyő ikonjáról megnyitott alkalmazásban töltsd be.

### Fájlként a telefonra küldve

Androidon az `index.html` Chrome-ban megnyitható (például a Letöltések mappából). iPhone-on a Fájlok alkalmazás nem futtatja a weboldalakat, ott a GitHub Pages a megoldás. Fájlként megnyitva az első alkalommal internet kell, utána a könyvtárak az eszközön maradnak.

## Használat

1. Válaszd ki az orvost.
2. A **Dátum** mezőben alapból a mai nap áll. Ha más napra kell az árlista, itt válaszd ki; a **Ma** gomb visszaállítja.
3. Állítsd be a mennyiségeket a −/+ gombokkal vagy beírással. A tételek csoportonként jelennek meg (pl. Rögzített pótlások, Kombinált munkák, Protetika).
   - A mennyiség 0 és 9 999 közötti egész szám. Tizedest („2,5”) az egész részére kerekít lefelé, és szól róla; negatív számot és betűt nem fogad el (a mennyiség marad, és üzenet jelzi). A „3 db” és az „1 000” alak is jó.
   - **Kereső** (több mint 8 tételnél): írd be a tétel nevének egy részét (pl. „cirk”), és a legördülő listában koppints a tételre: minden koppintás +1 db. Az elírást is megérti („fogsr jav”). Számítógépen a nyilakkal és Enterrel is választhatsz.
   - **Bemondás** (mikrofon gomb): mondd be, amit kérsz, pl. „két cirkon korona, egy ínymaszk és három műfog”, majd koppints a **Kész** gombra. Szünetet is tarthatsz, a Kész gombig figyel; beszéd közben látod, mit ismert fel. Utána megmutatja, mit állított be; a **Visszavonás** mindent visszaállít.
     - Szám nélkül +1 db; „még három …” hozzáad a meglévőhöz; „nem, három” vagy „illetve kettő” kijavítja az előző tétel számát.
     - Törlés és csökkentés: „töröld a cirkon koronát”, „ínymaszk nem kell”, „műfog nulla”, „PMMA korona helyett két cirkon korona”, „töröld az egészet”, „a fémkerámiából vegyél le egyet”, „eggyel kevesebb műfog”.
     - Több tételre egy szám: „egyéni kanál meg harapási sablon, kettő-kettő”. Ha nincs pontos szám („pár műfog”, „két-három fémkerámia”), rákérdez.
     - Az orvos nevét is bemondhatod („Michel doktornak két cirkon csap”).
     - Ha valami több tételre is illik (pl. „két korona”, „két cirkon”), rákérdez, és felajánlja a lehetséges tételeket. Amit ott választasz, azt megjegyzi: legközelebb a „korona” magától azt a tételt jelenti. Ezeket a más neveket az Árak lapon a tételre koppintva (**Más nevek a bemondáshoz**) látod és írhatod át; ide magad is felvehetsz neveket, pl. „zirkon, cirkónia”.
     - Érti a felismerő tipikus tévesztéseit is: „szirkon”, „pé em em á”, „inlé / onlé”, „mű íny”, „fog sor javítás”, „3-at”, „2db”, „hármat”.
     - Chrome-ban (Android) és Safariban (iPhone) működik; internet kell hozzá, és első használatkor engedélyezni kell a mikrofont. iPhone-on a Diktálásnak is bekapcsolva kell lennie (Beállítások → Általános → Billentyűzet), és a kezdőképernyőre tett alkalmazásban az Apple nem engedi a beszédfelismerést: ott Safariban nyisd meg az oldalt.
   - **Csak a kiválasztottak**: a lista csak a beállított tételeket mutatja; a **Mind a … tétel** gomb hozza vissza a teljes listát.
4. Alul látod a kiválasztott tételek számát és az élő végösszeget.
5. **Előnézet**: megmutatja a kész PDF-et. **PDF letöltése** / **Megosztás**: elkészíti és letölti vagy megosztja (nyomtató, e-mail, üzenetküldő).
6. **Gmail**: telefonon a megosztást nyitja meg kitöltött tárggyal és levélszöveggel, a PDF-fel csatolva; ott válaszd a Gmailt, és írd be a címzettet. Számítógépen a PDF letöltődik, és megnyílik a Gmail új levele a címzettel, tárggyal és szöveggel kitöltve; a PDF-et a Letöltések mappából csatold. A címzettet az orvos e-mail-címéből veszi (Árak lap → az orvos nevére koppintva adható meg).

Tudnivalók:

- A PDF neve `Arlista_<Orvos>_<ÉÉÉÉ-HH-NN>.pdf`, a sorszáma `ÉÉÉÉHHNN-NN`, ami minden napra 01-től indul. A dátum, a fájlnév, a sorszám és az érvényesség is a kiválasztott napból számolódik.
- Elkészítés után a mennyiségek nullázódnak (és a dátum visszaáll a mai napra), mint a makróban. A **Mennyiségek vissza** gombbal visszahozhatók.
- A PDF mindig egy A4-es oldal. Sok tételnél a betű és a sormagasság fokozatosan kisebb lesz (10 pontról legfeljebb 7,5 pontig). Ha így sem fér el, az alkalmazás szól, és nem készít PDF-et.

## Árak frissítése Excelből

1. A munkafüzet **„Adatbázis”** lapja legyen a megszokott szerkezetű:
   - az 1. sorban, a **B1** cellától jobbra az orvosok nevei;
   - az **A** oszlopban, az **A2** cellától lefelé a tételek;
   - a metszéspontokban az egységárak forintban (üres cella: az orvosnak nincs ára arra a tételre).
   - csoportcím (nem kötelező): egy sor, amelynek az **A** cellája kettősponttal végződik (pl. `Protetika:`), és nincs benne ár. Az alatta lévő tételek ebbe a csoportba kerülnek; a csoportok a listában, az Árak lapon és a PDF-ben is megjelennek.
2. Az alkalmazásban: **Árak → Excel-fájl kiválasztása**, majd válaszd ki a `.xlsx` vagy `.xlsm` fájlt. A régi `.xls` is működik.
3. Az előnézet megmutatja, hány orvos és hány tétel van a fájlban, melyik ár változik, és mi kerül be vagy ki. Az **Árak felülírása** gomb menti el.
4. Ha mégsem jó, a megjelenő **Visszavonás** gombbal vagy az Árak lap *Visszaállítás az utolsó betöltés előtti árakra* gombjával visszaállíthatod.

Az árak a tételek és az orvosok **neve** alapján párosulnak. Ha egy nevet átírsz az Excelben, az új tételként jelenik meg, a régi pedig törlődőként.

- Szöveges árcellában (és az Árak lapon beírva) ezek az alakok jók: `12500`, `12 500`, `12.500`, `12 500 Ft`, `12.500,- Ft`, `10.000,50`, `10,5`. Forintban nincs három tizedesjegy, ezért az `1,500` ezerötszáz forint, a `0,500` viszont fél forint.
- Az orvos neve legfeljebb 120, a tétel neve legfeljebb 200 karakter lehet; a hosszabb nevet az előnézet hibaként jelzi.

## Biztonsági mentés

Az árak alapból csak azon a telefonon, abban a böngészőben vannak tárolva. Az Árak lapon a **Mentés fájlba** gomb letölt egy mentést (JSON), amit a **Visszatöltés fájlból** gombbal bármikor, akár másik telefonon is visszatölthetsz. A mentésben benne vannak az orvosok (e-mail-címmel), a tételek (csoporttal), az árak, a beállítások és a bemondás „más nevei” is; a GitHub-kulcs és a napi sorszám nincs benne. Kényelmesebb a GitHub-mentés (lent), ami ezt magától elvégzi.

### Árak átküldése linkben

Az árak egy linkkel is átvihetők egy másik eszközre (például a számítógépről a telefonra):

1. Árak lap → **Küldés linkben** → **Megosztás** vagy **Másolás**, és küldd el magadnak (e-mailben, üzenetben).
2. A másik eszközön nyisd meg a linket Chrome-ban vagy Safariban. Az alkalmazás megmutatja, mi változik (új orvos, új tételek, változó árak), és csak a **Betöltés** gombra tölti be.

- A link orvosainak árai a linkből jönnek; az ott már meglévő többi orvos és tétel nem változik. Ha az eszközön még a beépített mintaadatok (Peti, Dani, Anna) vannak, azok helyére kerülnek.
- Az árak a link `#` utáni részében vannak, ezért nem kerülnek fel semmilyen szerverre, de maga a link tartalmazza az árakat: csak annak küldd el, aki láthatja őket.
- Ha a link egy üzenetküldő (pl. Messenger) beépített böngészőjében nyílik meg, az árak csak ott lesznek meg. Ilyenkor a felül megjelenő **Link másolása** gombbal másold ki, és nyisd meg Chrome-ban vagy Safariban.
- iPhone-on a kezdőképernyőre tett alkalmazás külön tárhelyet használ, mint a Safari. Ott az Árak lap **Betöltés linkből** gombjával illeszd be a linket.

## Mentés GitHubra

Bekapcsolva az alkalmazás egy **privát** GitHub-tárolóba ment:

- **minden elkészült PDF-et**, ide: `arlistak/<ÉÉÉÉ-HH>/<sorszám>_Arlista_<Orvos>_<dátum>.pdf`;
- **az árakat**, minden változás után (kb. 20 másodperccel később, Excel-importnál azonnal), ide: `arak/arak.json`. Minden mentés új változat, a régiek megmaradnak.

Visszakeresés az alkalmazásban:

- **Mentett árlisták**: a fejléc doboz ikonja vagy az Árak lap gombja. Hónaponként csoportosítva, orvosra, dátumra vagy sorszámra kereshető. Bármelyik PDF megnézhető, letölthető vagy megosztható.
- **Az árak korábbi változatai** (Árak lap): bármelyik korábbi árállapot visszatölthető. Betöltés előtt látszik, mi változik.

Internet nélkül a PDF-ek sorba kerülnek, és a következő internetkapcsolatkor maguktól feltöltődnek. Ha több telefon menti ugyanabba a tárolóba, a napi sorszám a GitHubon már meglévő árlistákat is figyelembe veszi.

### Beállítás (eszközönként egyszer)

A mentések tárolója már létezik: **benimatyi-ctrl/dental-arlista-mentesek** (privát). Kell hozzá egy hozzáférési kulcs, amit csak te hozhatsz létre:

1. Nyisd meg: <https://github.com/settings/personal-access-tokens/new>
2. **Token name:** `dentÁl árlista`; **Expiration:** 1 év (lejárat előtt a GitHub e-mailt küld).
3. **Repository access:** *Only select repositories* → `dental-arlista-mentesek`.
4. **Permissions → Repository permissions → Contents:** *Read and write*. Más jogosultság nem kell.
5. **Generate token**, majd másold ki a kulcsot (`github_pat_…`).
6. Az alkalmazásban: **Árak → Mentés GitHubra**. Tároló: `benimatyi-ctrl/dental-arlista-mentesek`, kulcs: a kimásolt kulcs → **Kapcsolódás**.

Ha a GitHubon már vannak mentett árak (például egy második telefonnál), az alkalmazás megkérdezi, hogy azokat töltse-e be, vagy az eszközön lévőket mentse.

Biztonság: a kulcs csak azon az eszközön tárolódik, ahol megadtad, és csak ehhez az egy tárolóhoz fér hozzá, csak fájlokat írhat és olvashat vele. Ha a telefon elveszik, a kulcsot a <https://github.com/settings/personal-access-tokens> oldalon egy kattintással visszavonhatod. Az alkalmazás nyilvános tárolóba nem hajlandó menteni.

## A CONFIG átírása

Az `index.html` legelején, az első `<script>` blokkban van a `window.CONFIG`. Csak itt kell átírni az adatokat; bármilyen szövegszerkesztő megfelel.

| Mező | Jelentés | Alapérték |
| --- | --- | --- |
| `cegnev` | Cégnév a PDF metaadataiban és a felületen | `"dentÁl"` |
| `cim`, `telefon`, `email` | Elérhetőségek a PDF fejlécében, a logó alatt. Üresen hagyva elmaradnak. | Mintaadatok: **cseréld le** |
| `logo` | A PDF és a fejléc logója. Alapból a beágyazott színes logó (`"#logo-szines"`), de egy teljes `<svg>…</svg>` szöveg is megadható. | `"#logo-szines"` |
| `logoMono` | Az egyszínű logó | `"#logo-mono"` |
| `pdfSzinesLogo` | `true`: színes logó a PDF-ben; `false`: egyszínű, fekete-fehér nyomtatáshoz. Az Árak lapon is átállítható. | `true` |
| `pdfLabjegyzet` | A PDF lábjegyzetének szövege (az érvényesség mögött) | Rövid megjegyzés |
| `ervenyessegNapok` | Ennyi napig érvényes az árlista; `0` esetén nem írja ki | `30` |
| `nullazasGeneralasUtan` | A mennyiségek nullázódjanak-e a PDF után. Az Árak lapon is átállítható. | `true` |
| `cimzettElotag` | A címzett neve elé kerül a PDF-en („Dr. Anna”). Ha a név már így kezdődik, nem ismétli. | `"Dr. "` |
| `gmailGomb` | Megjelenjen-e a Gmail gyorsgomb | `true` |
| `emailTargy`, `emailSzoveg` | A Gmail-levél tárgya és szövege. Helyettesítők: `{cimzett}`, `{datum}`, `{sorszam}`, `{osszeg}`, `{cegnev}`; új sor: `
` | Rövid, udvarias kísérőszöveg |

A logók az `index.html` végén, a `logo-szines`, `logo-mono` és `logo-jel` sablonokban vannak. Cseréjükhöz a teljes `<svg>…</svg>` részt kell kicserélni.

## Új verzió közzététele

A módosított `index.html`-t elég feltölteni: az alkalmazás megnyitáskor először a hálózatról kéri le az oldalt, és csak akkor használja az elmentett példányt, ha 3 másodpercen belül nem kap választ (vagy nincs internet). Ha az ikonokat vagy a `manifest.webmanifest`-et cseréled, az `sw.js` elején emeld a `VERZIO` értékét is (például `'v2'` → `'v3'`).

## Technikai adatok

- Könyvtárak, rögzített verzióval és ellenőrzőösszeggel (SRI). Az első megnyitáskor töltődnek le, utána az eszközön (IndexedDB) maradnak.

  | Könyvtár | Feladat | Forrás |
  | --- | --- | --- |
  | pdfmake 0.3.11 | PDF készítése | jsDelivr |
  | IBM Plex Sans 3.005 Regular és SemiBold | Betűtípus | jsDelivr, IBM GitHub |
  | SheetJS 0.18.5 | Excel olvasása | cdnjs |
  | pdf.js 3.11.174 | Előnézet | cdnjs |
  | Roboto | Tartalék betűtípus, csak ha a Plex nem érhető el | jsDelivr |

- Az adatok (orvosok, tételek, árak, beállítások, napi sorszám) a böngésző `localStorage`-ében vannak.
- A letöltött könyvtárakat az alkalmazás minden betöltéskor újra ellenőrzi (SRI). Sima `http://` címen, ahol ez nem lehetséges, nem futtatja őket; ilyenkor `https://` címen vagy fájlként nyisd meg.
- Az `index.html` tartalombiztonsági szabályt (Content-Security-Policy) is tartalmaz: csak a saját fájlt, a két engedélyezett CDN-t (cdnjs.cloudflare.com, cdn.jsdelivr.net) és a mentésekhez a GitHub API-t (api.github.com) éri el. Szkript csak `nonce="dentAl"` jelöléssel fut (a CONFIG-blokk és a fő szkript ilyen); ha valaki egy nevet HTML-ként csempészne be, az abban lévő eseménykezelő sem futna le. Ha saját `<script>` blokkot teszel az oldalba, az is kapja meg ezt a jelölést.
- A PDF egy háttérszálon (Web Worker) készül, így lassú telefonon sem akad meg közben a felület. Ha a böngésző ezt nem engedi, a PDF a régi módon, a fő szálon készül.
- A PDF betűje az IBM Plex Sans. Az ebben nem szereplő jelek (pl. emoji) kimaradnak a PDF-ből, hogy ne üres négyzet kerüljön a helyükre; a ®, ™, Ø és a magyar ékezetek megmaradnak.
- Ismert korlátok:
  - Az SheetJS 0.18.5-nek vannak ismert hibái (CVE-2023-30533, CVE-2024-22363), amelyek szándékosan rosszindulatú Excel-fájllal használhatók ki. Újabb javított változat csak a SheetJS saját CDN-jén van, amit a szabályok nem engednek, ezért csak saját, megbízható Excel-fájlt tölts be.
  - A pdf.js 3.11 ismert hibáját (CVE-2024-4367) az `isEvalSupported: false` beállítás kivédi, és az előnézet csak a saját magunk készítette PDF-et jeleníti meg.

## Tesztek

Az alkalmazáshoz automatizált tesztcsomag tartozik (Playwright): Chromiumban és WebKitben (az iOS Safari motorja), két mobilnézetben (375×812 és 360×740) és asztali nézetben fut. Az `index.html` önálló marad, a tesztek kívülről nyitják meg.

```bash
npm install
npx playwright install chromium webkit
npm test
```

Részletek, fájlonként mit tesztel: [tests/README.md](tests/README.md). A legutóbbi teljes tesztelés eredménye: [TESZTJELENTES.md](TESZTJELENTES.md).
