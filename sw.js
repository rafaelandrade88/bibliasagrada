/* =====================================================
   SERVICE WORKER — Bíblia Sagrada PWA
   Estratégia:
     - App shell (HTML/manifest/ícones): NETWORK FIRST
       → sempre tenta buscar a versão mais nova do servidor;
         só usa cache se estiver offline. Isso é o que faz
         as atualizações chegarem nos dispositivos já instalados.
     - Dados bíblicos (JSONs grandes): CACHE FIRST
       → não mudam com frequência, ficam disponíveis offline
         após a primeira leitura.
     - version.json: SEMPRE rede, nunca cache.
   ===================================================== */

/* Incrementar este número a cada deploy para forçar atualização do SW */
const SW_BUILD = '2025-06-26-v1';
const CACHE_NAME = 'biblia-sagrada-v4-' + SW_BUILD;
const DATA_CACHE = 'biblia-sagrada-data-v3';

/* Assets do app shell — verificados a cada carregamento (network first) */
const STATIC_ASSETS = [
  '/bibliasagrada/biblia-sagrada.html',
  '/bibliasagrada/manifest.json',
  '/bibliasagrada/icons/icon-192.png',
  '/bibliasagrada/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Lora:ital,wght@0,400;0,500;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=Spectral:ital,wght@0,300;0,400;0,600;1,400&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
];

/* URLs dos dados bíblicos (JSONs do GitHub) — cache first, raramente mudam */
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

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())   // ativa o novo SW imediatamente
      .catch(err => console.warn('[SW] Install cache error:', err))
  );
});

/* ── ACTIVATE: limpa caches de versões antigas (v1, v2, etc.) ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())   // assume controle das abas abertas
  );
});

/* ── FETCH: estratégia híbrida ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* version.json: NUNCA cachear — sempre buscar do servidor */
  if (url.includes('version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  /* Dados bíblicos: Cache First — não mudam, ficam offline */
  if (BIBLE_DATA_URLS.some(u => url.includes(u)) || url.includes('thiagobodruk')) {
    event.respondWith(cacheFirstWithNetwork(event.request, DATA_CACHE));
    return;
  }

  /* Fontes Google: Cache First (não mudam) */
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
    return;
  }

  /* App shell (HTML, manifest, ícones): NETWORK FIRST
     → CRÍTICO para atualizações chegarem aos dispositivos instalados.
       Sempre tenta buscar a versão nova do servidor primeiro;
       só usa o cache local se a rede falhar (modo offline). */
  if (
    url.includes('biblia-sagrada.html') ||
    url.includes('manifest.json') ||
    url.includes('/icons/') ||
    event.request.mode === 'navigate'
  ) {
    event.respondWith(networkFirstWithCache(event.request, CACHE_NAME));
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

/* Network First: tenta rede (sempre busca versão mais nova) →
   se falhar (offline), usa o que estiver no cache */
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
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
  /* Força ativação do novo SW assim que o usuário toca em "Atualizar" */
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  /* Pré-cacheia versão bíblica específica quando usuário seleciona */
  if (event.data?.type === 'PRECACHE_BIBLE' && event.data.url) {
    caches.open(DATA_CACHE).then(cache =>
      fetch(event.data.url)
        .then(r => { if (r.ok) cache.put(event.data.url, r); })
        .catch(() => { })
    );
  }
});