import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStudioServer } from '../../src/studio/server.ts';

test('standalone journey engine opens directly into its M5 interface', async t => {
  const root = mkdtempSync(join(tmpdir(), 'journey-standalone-'));
  const app = createStudioServer({ root });
  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const page = await fetch(base + '/?run=example');
  assert.equal(page.url, base + '/life32r3?mode=journey&run=example');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /持续旅途/);

  const presets = await fetch(base + '/api/v1/life32r3/bootstrap');
  assert.equal(presets.status, 200);
  assert.equal((await presets.json()).journeyPresets.length, 4);

  const annual = await fetch(base + '/api/v1/annual/INFP');
  assert.equal(annual.status, 404);
  await annual.json();
});
