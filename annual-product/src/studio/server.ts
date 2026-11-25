import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { annualBook, annualJourney } from './annual-book.ts';
import { createLocalServer, sendAsset, sendJson, StudioError } from './http.ts';

const assets = new Map<string, readonly [string, string]>([
  ['/season1-build.mjs', ['season1-build.mjs', 'text/javascript; charset=utf-8']],
  ['/season1-editor', ['season1.html', 'text/html; charset=utf-8']],
  ['/season1.js', ['season1.js', 'text/javascript; charset=utf-8']],
  ['/season1-state.mjs', ['season1-state.mjs', 'text/javascript; charset=utf-8']],
  ['/season1-story.mjs', ['season1-story.mjs', 'text/javascript; charset=utf-8']],
  ['/season1-edition.mjs', ['season1-edition.mjs', 'text/javascript; charset=utf-8']],
  ['/south-season.mjs', ['south-season.mjs', 'text/javascript; charset=utf-8']],
  ['/south-wuhan.mjs', ['south-wuhan.mjs', 'text/javascript; charset=utf-8']],
  ['/south-changsha.mjs', ['south-changsha.mjs', 'text/javascript; charset=utf-8']],
  ['/south-yangshuo.mjs', ['south-yangshuo.mjs', 'text/javascript; charset=utf-8']],
  ['/season1-wuhan.mjs', ['season1-wuhan.mjs', 'text/javascript; charset=utf-8']],
  ['/season1-changsha.mjs', ['season1-changsha.mjs', 'text/javascript; charset=utf-8']],
  ['/season1-yangshuo.mjs', ['season1-yangshuo.mjs', 'text/javascript; charset=utf-8']],
  ['/season1.css', ['season1.css', 'text/css; charset=utf-8']],
  ['/annual', ['annual.html', 'text/html; charset=utf-8']],
  ['/annual.js', ['annual.js', 'text/javascript; charset=utf-8']],
  ['/annual-state.mjs', ['annual-state.mjs', 'text/javascript; charset=utf-8']],
  ['/annual-share.mjs', ['annual-share.mjs', 'text/javascript; charset=utf-8']],
  ['/annual.css', ['annual.css', 'text/css; charset=utf-8']],
]);
const scenes = /^\/annual-scenes\/(journey|kitchen|street|workshop|park|room|rehearsal|pool|photo|courtyard|pet|bookshop|plum|tofu|football|bicycle|noodles|ferry|proof|ricecake|pressroom|riverstep|ticketbag)\.webp$/;

export function createAnnualServer() {
  return createLocalServer((req, res, url, body) => {
    if (req.method === 'GET') {
      if (url.pathname === '/') {
        res.writeHead(302, { Location: '/annual' + url.search }).end();
        return;
      }
      const legacy = url.pathname === '/season1-legacy';
      const season = ['/season1', '/season1-editor', '/season1-preview'].includes(url.pathname);
      const oldEdition = ['2','3'].includes(url.searchParams.get('edition') ?? '');
      const oldClassic = url.pathname !== '/season1' && url.searchParams.get('classic') === '1';
      if (season && (oldEdition || oldClassic)) {
        if (url.pathname === '/season1') {
          url.searchParams.delete('preview');
          url.searchParams.delete('classic');
        }
        if (url.pathname === '/season1-preview') url.searchParams.set('preview', '1');
        res.writeHead(302, {Location:'/season1-legacy' + url.search}).end();
        return;
      }
      if (url.pathname === '/season1' || url.pathname === '/season1-preview' || legacy) {
        const preview = url.pathname === '/season1-preview' || (legacy && (url.searchParams.get('preview') === '1' || url.searchParams.get('classic') === '1'));
        const file = legacy
          ? '南下十五日/旧版存档/' + (preview ? '可跳过试读.html' : '完成专注.html')
          : (preview ? '第一季·南下十五日试读.html' : '南下十五日/index.html');
        const page = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
        const nonce = randomBytes(18).toString('base64');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; frame-ancestors 'none'`);
        res.end(page.replace(/<(script|style)\b/g, `<$1 nonce="${nonce}"`));
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
