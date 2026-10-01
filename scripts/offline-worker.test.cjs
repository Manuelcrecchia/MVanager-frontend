const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture() {
  const listeners = {}, entries = new Map(), responses = new Map();
  let offline = false;
  const key = request => typeof request === 'string' ? request : request.url;
  const fetch = async request => {
    if (offline) throw new Error('offline');
    const body = responses.get(key(request));
    return new Response(body || '', { status: body == null ? 404 : 200 });
  };
  const cache = { match: async request => entries.get(key(request))?.clone(), put: async (request, response) => entries.set(key(request), response.clone()), add: async request => { const response = await fetch(request); if (!response.ok) throw new Error('missing'); entries.set(key(request), response); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/offline-worker.js'), 'utf8'), {
    self: { registration: { scope: 'https://app.test/' }, location: { origin: 'https://app.test' }, clients: { claim: async () => {} }, addEventListener: (name, fn) => listeners[name] = fn },
    caches: { open: async () => cache }, fetch, Response, URL, setTimeout, clearTimeout,
  });
  return { listeners, entries, responses, offline: () => offline = true, async cacheShell() { let work; listeners.message({ data: { type: 'CACHE_SHELL', assets: [] }, waitUntil: promise => work = promise }); await work; } };
}
test('preloads entry modules and dependencies before an offline navigation', async () => {
  const f = fixture();
  f.responses.set('https://app.test/', '<script src="main-1.js"></script>');
  f.responses.set('https://app.test/main-1.js', 'import "./chunk-1.js";');
  f.responses.set('https://app.test/chunk-1.js', 'export const ready=true;');
  await f.cacheShell(); assert.equal(f.entries.size, 3);
  f.offline(); let response;
  f.listeners.fetch({ request: { url: 'https://app.test/homeAdmin/quotesHome', method: 'GET', mode: 'navigate', headers: new Headers() }, respondWith: value => response = value });
  assert.match(await (await response).text(), /main-1.js/);
});
test('an incomplete deployment keeps the previous complete shell', async () => {
  const f = fixture(); f.responses.set('https://app.test/', '<script src="main-1.js"></script>'); f.responses.set('https://app.test/main-1.js', 'export const old=true;');
  await f.cacheShell();
  f.responses.set('https://app.test/', '<script src="main-2.js"></script>'); f.responses.set('https://app.test/main-2.js', 'import "./missing.js";');
  await f.cacheShell(); assert.match(await f.entries.get('https://app.test/').clone().text(), /main-1.js/);
});
test('does not intercept authenticated API requests or external resources', () => {
  const f = fixture();
  for (const request of [
    { url: 'https://app.test/api/customers', method: 'GET', headers: new Headers({ Authorization: 'Bearer token' }), destination: '' },
    { url: 'https://external.test/file.js', method: 'GET', headers: new Headers(), destination: 'script' },
  ]) f.listeners.fetch({ request, respondWith: () => assert.fail('API and external resources must not be cached by the shell worker') });
});
