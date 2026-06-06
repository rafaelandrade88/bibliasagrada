/* =====================================================
   SERVICE WORKER — Bíblia Sagrada PWA
   Estratégia: Cache First para assets estáticos,
   Network First para JSONs da Bíblia (dados bíblicos)
   ===================================================== */

const CACHE_NAME    = 'biblia-sagrada-v1';
const DATA_CACHE    = 'biblia-sagrada-data-v1';

/* Assets que ficam em cache permanentemente */
const STATIC_ASSETS = [
  '/bibliasagrada/biblia-sagrada.html',
  '/bibliasagrada/manifest.json',
  '/bibliasagrada/icons/icon-192.png',
  '/bibliasagrada/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Lora:ital,wght@0,400;0,500;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=Spectral:ital,wght@0,300;0,400;0,600;1,400&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
];

/* URLs dos dados bíblicos (JSONs do GitHub) */
const BIBLE_DATA_URLS = [
  'https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/nvi.json',
  'https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/acf.json',
  'https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/aa.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_bbe.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/es_rvr.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/fr_apee.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/de_schlachter.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/zh_cuv.json',
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/ru_synodal.json',
];

/* ── INSTALL: cacheia assets estáticos ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache error:', err))
  );
});

/* ── ACTIVATE: limpa caches antigos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estratégia híbrida ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* Dados bíblicos: Cache First com fallback para rede
     → Após primeira visita, a Bíblia fica disponível offline */
  if (BIBLE_DATA_URLS.some(u => url.includes(u) || url.includes('thiagobodruk'))) {
    event.respondWith(cacheFirstWithNetwork(event.request, DATA_CACHE));
    return;
  }

  /* Fontes Google: Cache First (não mudam) */
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
    return;
  }

  /* App shell (HTML, manifest, ícones): Cache First */
  if (url.includes('biblia-sagrada.html') || url.includes('manifest.json') || url.includes('/icons/')) {
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
    return;
  }

  /* Demais requisições: Network First */
  event.respondWith(networkFirstWithCache(event.request, CACHE_NAME));
});

/* Cache First: tenta cache → se não tiver, busca na rede e guarda */
async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — conteúdo não disponível', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* Network First: tenta rede → se falhar, usa cache */
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

/* ── MENSAGENS do app principal ── */
self.addEventListener('message', event => {
  /* Força atualização do SW quando app pede */
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  /* Pré-cacheia versão bíblica específica quando usuário seleciona */
  if (event.data?.type === 'PRECACHE_BIBLE' && event.data.url) {
    caches.open(DATA_CACHE).then(cache =>
      fetch(event.data.url)
        .then(r => { if (r.ok) cache.put(event.data.url, r); })
        .catch(() => {})
    );
  }
});
