// CALA LUNA — a tiny static server for game/ (Node 22, standard library
// only), so the game can be played locally without a build step:
//   node serve.ts [--port 8080] [--host 127.0.0.1]
// Serves game/ at http://localhost:8080 with the MIME types a browser
// game needs. A development convenience, not a web server. --port 0
// picks a free port and prints it; every request is logged to the console.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
// 0 is valid: the OS picks a free port, and the listen callback prints it.
const port = Number.isInteger(requested) && requested >= 0 && requested < 65536 ? requested : 8080;
const hostIndex = args.indexOf('--host');
const host = hostIndex === -1 ? undefined : (args[hostIndex + 1] || undefined);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((request, response) => {
  const log = (status: number, path: string) => console.log(`${request.method} ${path} -> ${status}`);
  let pathname: string;
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // A malformed % sequence used to throw out of the handler and kill
    // the whole server; now it is just a 400.
    log(400, request.url ?? '/');
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    log(403, pathname);
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    log(404, pathname);
    response.writeHead(404).end('not found');
    return;
  }
  log(200, pathname);
  response.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'content-length': size,
    // Development server: never let the browser cache a stale build.
    'cache-control': 'no-cache',
  });
  // HEAD asks for headers only: no body, or the client hangs waiting
  // for bytes it never asked for.
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(file).pipe(response);
});

server.on('error', (err) => {
  const code = (err as { code?: string }).code;
  if (code === 'EADDRINUSE') {
    console.error(`CALA LUNA: port ${port} is already in use — try node serve.ts --port ${port + 1}`);
  } else {
    console.error('CALA LUNA: server error:', err.message);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  // With --port 0 the OS chose the port: report the real one.
  const addr = server.address();
  const actual = typeof addr === 'object' && addr ? addr.port : port;
  console.log(`CALA LUNA at http://${host ?? 'localhost'}:${actual}`);
});
