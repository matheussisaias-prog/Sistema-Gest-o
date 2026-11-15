/* Task Flow · sw.js — guarda as telas do sistema no aparelho para abrir sem internet.
   Sempre tenta a internet primeiro (versão nova); sem conexão, usa a cópia guardada.
   Os dados (api/) nunca ficam aqui: a lista de Minhas atividades e a fila de envio ficam no próprio app. */
const CACHE = 'tf-app-v1';
const EXTERNOS = /(^|\.)fonts\.(googleapis|gstatic)\.com$|(^|\.)cdnjs\.cloudflare\.com$|(^|\.)cdn\.jsdelivr\.net$/;
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['index.html', 'entrar.html'])).catch(() => {})); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin ? /\/api(\/|$)/.test(u.pathname) : !EXTERNOS.test(u.hostname)) return;
  e.respondWith(fetch(r).then(resp => {
    if (resp && (resp.ok || resp.type === 'opaque')) { const c = resp.clone(); caches.open(CACHE).then(k => k.put(r, c)).catch(() => {}); }
    return resp;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : null)).then(m => m || Response.error())));
});
