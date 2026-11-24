import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createAnnualServer } from '../../src/studio/server.ts';

test('standalone annual product serves its timer, book and preference API', async t => {
  const server = createAnnualServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const page = await fetch(base + '/annual');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /旅人档案/);

  const image = await fetch(base + '/annual-scenes/journey.webp');
  assert.equal(image.headers.get('content-type'), 'image/webp');
  await image.arrayBuffer();

  const book = await fetch(base + '/api/v1/annual/INFP');
  assert.equal(book.status, 200);
  assert.equal((await book.json()).length, 1752);

  const journey = await fetch(base + '/api/v1/annual/INFP/journey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ letter: 'S', from: 2 }]),
  });
  assert.equal(journey.status, 200);
  assert.equal((await journey.json()).cards.length, 1752);

  const legacy = await fetch(base + '/life32r3');
  assert.equal(legacy.status, 404);
  await legacy.json();
});
