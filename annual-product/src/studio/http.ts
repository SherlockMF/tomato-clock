import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export class StudioError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res: ServerResponse, value: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

export function sendAsset(res: ServerResponse, [file, contentType]: readonly [string, string]) {
  res.setHeader('Content-Type', contentType);
  res.end(readFileSync(new URL('../../studio/' + file, import.meta.url)));
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    length += chunk.length;
    if (length > 1024 * 1024) {
      throw new StudioError(413, 'body_too_large', '配置正文上限 1 MiB');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
  } catch {
    throw new StudioError(400, 'invalid_json', '无效 JSON');
  }
}

export function createLocalServer(route: (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  body: unknown,
) => void | Promise<void>) {
  return createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
        throw new StudioError(403, 'host_denied', '只接受本机 Host');
      }
      const origin = 'http://' + host;
      const url = new URL(req.url ?? '/', origin);
      let body: unknown;
      if (req.method === 'POST') {
        if ((req.headers.origin && req.headers.origin !== origin) ||
            req.headers['sec-fetch-site'] === 'cross-site') {
          throw new StudioError(403, 'origin_denied', '拒绝跨来源写入');
        }
        if (!req.headers['content-type']?.startsWith('application/json')) {
          throw new StudioError(415, 'json_required', '需要 application/json');
        }
        body = await readJson(req);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
      await route(req, res, url, body);
    } catch (error) {
      if (error instanceof StudioError) {
        sendJson(res, { error: { code: error.code, message: error.message } }, error.status);
      } else {
        console.error(error);
        sendJson(res, { error: { code: 'internal_error', message: '服务内部错误，请检查本地终端' } }, 500);
      }
    }
  });
}
