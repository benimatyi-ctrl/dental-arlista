/* dentÁl árlista — opcionális service worker.
   Csak webes közzétételnél kell (pl. GitHub Pages): ettől nyílik meg az oldal internet nélkül is.
   Az index.html magától regisztrálja, ha ez a fájl mellette van.
   Az index.html frissítése magától átjön (az oldalt mindig a hálózatról próbálja először, legfeljebb 3 másodpercig).
   Ha az ikonokat vagy a manifestet cseréled, emeld a VERZIO-t. */
const VERZIO = 'v3';
const ELOTAG = 'dental-arlista-';                 // a user.github.io origin a felhasználó minden repójáé közös
const TAR = ELOTAG + VERZIO;
const STATIKUS = ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const VARAKOZAS_MS = 3000;                        // gyenge térerőnél ennyi után a mentett példány jön

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(TAR);
    // egyenként, hogy egy hiányzó opcionális fájl ne buktassa el a telepítést
    await Promise.all(['./index.html'].concat(STATIKUS.map(f => './' + f))
      .map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(ELOTAG) && k !== TAR) await caches.delete(k);
    await self.clients.claim();
  })());
});

function relativ(url) {                           // az útvonal a service worker hatókörén belül ('' = a mappa maga)
  const hatokor = new URL(self.registration.scope);
  return url.pathname.startsWith(hatokor.pathname) ? url.pathname.slice(hatokor.pathname.length) : null;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // a CDN-könyvtárakat az oldal maga menti el (IndexedDB)
  const rel = relativ(url);
  if (rel === null) return;

  if (req.method === 'HEAD') {                    // az oldal így nézi meg, hogy megvannak-e az ikonok és a manifest
    if (!STATIKUS.includes(rel)) return;
    e.respondWith(fetch(req).catch(async err => {
      const t = await caches.match(req.url, { cacheName: TAR });
      if (t) return new Response(null, { status: 200, headers: t.headers });
      throw err;
    }));
    return;
  }
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    if (rel !== '' && rel !== 'index.html') return;  // csak az alkalmazás oldalát kezeljük
    const halo = fetch(req, { cache: 'no-cache' }).then(v => ({ v, masolat: v.clone() }));
    e.waitUntil(halo.then(async ({ v, masolat }) => {
      if (v.ok && (v.headers.get('content-type') || '').includes('text/html')) await (await caches.open(TAR)).put('./index.html', masolat);
    }).catch(() => {}));
    e.respondWith((async () => {
      const mentett = await caches.match('./index.html', { cacheName: TAR });
      if (!mentett) return halo.then(r => r.v);
      const idozito = new Promise(res => setTimeout(() => res(null), VARAKOZAS_MS));
      try {
        const r = await Promise.race([halo, idozito]);
        return r && r.v.ok ? r.v : mentett;
      } catch (err) { return mentett; }
    })());
    return;
  }

  if (!STATIKUS.includes(rel)) return;            // ikonok, manifest: mentett példány először
  e.respondWith((async () => {
    const talalt = await caches.match(req, { cacheName: TAR });
    if (talalt) return talalt;
    const valasz = await fetch(req);
    if (valasz.ok) { const m = valasz.clone(); e.waitUntil(caches.open(TAR).then(c => c.put(req, m))); }
    return valasz;
  })());
});
