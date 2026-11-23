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

// --port and --host come from the command line; anything out of range
// falls back to the defaults. 0 is a valid port: the OS picks a free
// one, and the listen callback prints it.
function parseArgs() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const wanted = Number(flag('--port') ?? 8080);
  const port = Number.isInteger(wanted) && wanted >= 0 && wanted < 65536 ? wanted : 8080;
  const host = flag('--host') || undefined;
  return { port, host };
}

const { port, host } = parseArgs();

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

function mimeFor(file: string): string {
  return MIME[extname(file)] ?? 'application/octet-stream';
}

// The requested path, decoded — or null when the URL is malformed.
function requestedPath(rawUrl: string | undefined): string | null {
  try {
    const url = new URL(rawUrl ?? '/', 'http://localhost');
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

// Map a URL path onto a file under game/: the file and its size, or
// 'forbidden' when the path escapes the root (a traversal attempt),
// or 'missing' when it is not a file at all.
function resolveFile(pathname: string): { file: string; size: number } | 'forbidden' | 'missing' {
  const withIndex = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  const file = resolve(join(root, normalize(withIndex)));
  if (file !== root && !file.startsWith(root + sep)) return 'forbidden';
  try {
    const stats = statSync(file);
    if (!stats.isFile()) return 'missing';
    return { file, size: stats.size };
  } catch {
    return 'missing';
  }
}

const server = createServer((request, response) => {
  const log = (status: number, path: string) => console.log(`${request.method} ${path} -> ${status}`);
  const pathname = requestedPath(request.url);
  if (pathname === null) {
    // A malformed % sequence used to throw out of the handler and kill
    // the whole server; now it is just a 400.
    log(400, request.url ?? '/');
    response.writeHead(400).end('bad request');
    return;
  }
  const resolved = resolveFile(pathname);
  if (resolved === 'forbidden') {
    log(403, pathname);
    response.writeHead(403).end('forbidden');
    return;
  }
  if (resolved === 'missing') {
    log(404, pathname);
    response.writeHead(404).end('not found');
    return;
  }
  log(200, pathname);
  response.writeHead(200, {
    'content-type': mimeFor(resolved.file),
    'content-length': resolved.size,
    // Development server: never let the browser cache a stale build.
    'cache-control': 'no-cache',
  });
  // HEAD asks for headers only: no body, or the client hangs waiting
  // for bytes it never asked for.
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(resolved.file).pipe(response);
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
