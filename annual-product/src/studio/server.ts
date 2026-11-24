import { annualBook, annualJourney } from './annual-book.ts';
import { createLocalServer, sendAsset, sendJson, StudioError } from './http.ts';

const assets = new Map<string, readonly [string, string]>([
  ['/annual', ['annual.html', 'text/html; charset=utf-8']],
  ['/annual.js', ['annual.js', 'text/javascript; charset=utf-8']],
  ['/annual-state.mjs', ['annual-state.mjs', 'text/javascript; charset=utf-8']],
  ['/annual-share.mjs', ['annual-share.mjs', 'text/javascript; charset=utf-8']],
  ['/annual.css', ['annual.css', 'text/css; charset=utf-8']],
]);
const scenes = /^\/annual-scenes\/(journey|kitchen|street|workshop|park|room|rehearsal|pool|photo|courtyard|pet|bookshop|plum|tofu|football|bicycle)\.webp$/;

export function createAnnualServer() {
  return createLocalServer((req, res, url, body) => {
    if (req.method === 'GET') {
      if (url.pathname === '/') {
        res.writeHead(302, { Location: '/annual' + url.search }).end();
        return;
      }
      const asset = assets.get(url.pathname);
      if (asset) {
        sendAsset(res, asset);
        return;
      }
      const scene = scenes.exec(url.pathname);
      if (scene) {
        sendAsset(res, ['annual-scenes/' + scene[1] + '.webp', 'image/webp']);
        return;
      }
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api' && parts[1] === 'v1' && parts[2] === 'annual' && parts[3]) {
      if (req.method === 'GET' && parts.length === 4) {
        sendJson(res, annualBook(parts[3]));
        return;
      }
      if (req.method === 'POST' && parts.length === 5 && parts[4] === 'journey') {
        sendJson(res, annualJourney(parts[3], body));
        return;
      }
    }
    throw new StudioError(404, 'not_found', '页面或接口不存在');
  });
}
