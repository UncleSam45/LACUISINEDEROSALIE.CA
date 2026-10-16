import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { validateOrder } from '../../worker.js';
const settings = JSON.parse(await readFile(new URL('../../assets/data/settings.json', import.meta.url)));
const data = { settings, menus: {}, items: {}, delivery: { fulfillment_options: [], delivery_policy: { version: 'test' } } };
const originalFetch = globalThis.fetch;
let stripeCalls = 0;
let reads = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.stripe.com')) { stripeCalls++; throw Error('Stripe must not be called'); }
  assert.equal(init.cache, 'no-store');
  reads++;
  const name = String(url).match(/\/([^/]+)\.json$/)[1];
  return Response.json(data[name]);
};
try {
  for (const binding of [data, JSON.stringify(data), undefined]) {
    for (const path of ['/api/create-checkout-session', '/create-checkout-session', '/api/create-checkout-session-v2', '/create-checkout-session-v2']) {
      // Deliberately malformed and empty body: closure must win before validation or Stripe.
      const response = await worker.fetch(new Request(`https://example.test${path}`, { method: 'POST', body: 'not json' }), { PUBLIC_SITE_DATA: binding });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.match((await response.json()).error, /temporairement fermée/);
    }
  }
  assert.equal(reads, 16);
  const emergency = await worker.fetch(new Request('https://example.test/create-checkout-session', { method: 'POST' }), { STOREFRONT_CLOSED: 'true' });
  assert.equal(emergency.status, 503);
  assert.equal(reads, 16);
  assert.equal(stripeCalls, 0);
  assert.throws(() => validateOrder({}, data), /temporairement fermée/);
  const reopened = structuredClone(data);
  reopened.settings.closure.enabled = false;
  assert.throws(() => validateOrder({}, reopened), /panier est vide/);
  assert.equal((await worker.fetch(new Request('https://example.test/health'), {})).status, 200);
} finally { globalThis.fetch = originalFetch; }
console.log('closure endpoints, uncached settings, no Stripe side effects and manual reopening passed');
