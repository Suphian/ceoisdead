import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../site/', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
};

function inside(root, target) {
  const path = relative(root, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'));
}

/** Serve only public site files. No repository files or directory listings. */
export async function createStaticServer({ root = defaultRoot } = {}) {
  const publicRoot = await realpath(root);
  return createServer(async (request, response) => {
    const reply = (status, message, extraHeaders = {}) => {
      response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders,
      });
      response.end(request.method === 'HEAD' ? undefined : message);
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let pathname;
    try {
      const rawPath = (request.url || '/').split('?')[0];
      if (!rawPath.startsWith('/')) throw new Error('Invalid request target');
      pathname = decodeURIComponent(rawPath);
    } catch {
      reply(400, 'Invalid request path');
      return;
    }
    // Also reject Windows separators/alternate data streams on every platform.
    if (/[\\\0:]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
      reply(403, 'Forbidden');
      return;
    }

    let target = resolve(publicRoot, '.' + pathname);
    if (!inside(publicRoot, target)) {
      reply(403, 'Forbidden');
      return;
    }

    try {
      target = await realpath(target);
      if (!inside(publicRoot, target)) {
        reply(403, 'Forbidden');
        return;
      }
      let info = await stat(target);
      if (info.isDirectory()) {
        target = await realpath(resolve(target, 'index.html'));
        if (!inside(publicRoot, target)) {
          reply(403, 'Forbidden');
          return;
        }
        info = await stat(target);
      }
      if (!info.isFile()) {
        reply(404, 'Not found');
        return;
      }
      const body = request.method === 'HEAD' ? null : await readFile(target);
      response.writeHead(200, {
        'Content-Type': mime[extname(target).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body ? body.length : info.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      response.end(body);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') reply(404, 'Not found');
      else if (error.code === 'EACCES' || error.code === 'EPERM') reply(403, 'Forbidden');
      else {
        console.error('Static file request failed:', error.message);
        reply(500, 'Server error');
      }
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  const host = process.env.HOST || '127.0.0.1';
  const server = await createStaticServer();
  server.on('error', error => {
    console.error('Unable to start game server:', error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log('Game ready at http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + port);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
