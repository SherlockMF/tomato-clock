import { join } from 'node:path';
import { createLocalServer, sendAsset, sendJson, StudioError } from './http.ts';
import { service32 } from './life32r3-routes.ts';

const assets = new Map<string, readonly [string, string]>([
  ['/life32r3', ['life32r3.html', 'text/html; charset=utf-8']],
  ['/life32r3.js', ['life32r3.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export function createStudioServer(options: { root: string; narratorPort?: number }) {
  const life32r3 = service32(join(options.root, 'life32r3'), options.narratorPort);
  const server = createLocalServer(async (req, res, url, body) => {
    if (req.method === 'GET') {
      if (url.pathname === '/' ||
          (url.pathname === '/life32r3' && url.searchParams.get('mode') !== 'journey')) {
        const query = new URLSearchParams([['mode', 'journey']]);
        for (const [key, value] of url.searchParams) {
          if (key !== 'mode') query.append(key, value);
        }
        res.writeHead(302, { Location: '/life32r3?' + query }).end();
        return;
      }
      const asset = assets.get(url.pathname);
      if (asset) {
        sendAsset(res, asset);
        return;
      }
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api' && parts[1] === 'v1' && parts[2] === 'life32r3') {
      const key = String(req.headers['idempotency-key'] ?? '');
      await life32r3.handle(req, url, body, key, (value, status) => sendJson(res, value, status));
      return;
    }
    throw new StudioError(404, 'not_found', '页面或接口不存在');
  });
  server.once('listening', () => { life32r3.catalog.recover(); });
  return {
    server,
    life32r3,
    async close() {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeAllConnections();
        });
      }
      await life32r3.close();
    },
  };
}
