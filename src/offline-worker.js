/* Cache only the public Angular shell. Authenticated data lives in IndexedDB,
 * partitioned by server, tenant, role and user, never in this shared cache. */
const CACHE = 'mv-shell-v1';
const root = new URL('./', self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE)));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CACHE_SHELL' || !Array.isArray(event.data.assets)) return;
  event.waitUntil(caches.open(CACHE).then(async cache => {
    const urls = [...new Set(event.data.assets)].filter(value => {
      const url = new URL(value, root);
      return url.origin === self.location.origin && /\.(js|css|woff2?)$/.test(url.pathname);
    });
    await Promise.all(urls.map(url => cache.add(url).catch(() => undefined)));
    // Refresh the shell on deployments even when the worker source is unchanged.
    // Cache its module graph before replacing HTML, so an interrupted update
    // cannot pair new HTML with missing JavaScript during the next offline boot.
    try {
      const response = await fetch(root, { cache: 'no-cache' });
      if (!response.ok) return;
      const html = await response.clone().text();
      const pending = [], visited = new Set();
      const collect = (text, base) => {
        const expression = /["']([^"'\s<>]+\.(?:js|css))["']/g;
        let match;
        while ((match = expression.exec(text))) {
          const url = new URL(match[1], base);
          if (url.origin === self.location.origin && new URL('./', url).href === root && !visited.has(url.href)) {
            visited.add(url.href); pending.push(url.href);
          }
        }
      };
      collect(html, root);
      while (pending.length) {
        const url = pending.shift(), asset = await fetch(url);
        if (!asset.ok) throw new Error('Incomplete shell');
        if (/\.js$/.test(url)) collect(await asset.clone().text(), url);
        await cache.put(url, asset);
      }
      await cache.put(root, response);
    } catch (error) { /* Keep the last complete shell. */ }
  }));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      let timer;
      const network = fetch(request);
      try {
        const response = await Promise.race([network, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Slow network')), 8000); })]);
        if (response.status >= 500) return (await cache.match(root)) || response;
        return response;
      } catch (error) {
        return (await cache.match(root)) || new Response('Connessione necessaria per il primo avvio.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  if (!['script', 'style', 'font'].includes(request.destination)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }));
});
