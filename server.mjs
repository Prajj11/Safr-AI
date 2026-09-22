import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toNodeHandler } from 'srvx/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDir = path.resolve(__dirname, 'dist/client');
const serverEntry = path.resolve(__dirname, 'dist/server/server.js');

if (!fs.existsSync(serverEntry)) {
  console.error('Server build not found at', serverEntry, '- run "npm run build" first.');
  process.exit(1);
}

const { default: serverApp } = await import(pathToFileURL(serverEntry).href);
const ssrHandler = toNodeHandler(serverApp.fetch);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Check static file in dist/client
  if (pathname !== '/') {
    const filePath = path.join(clientDir, pathname);
    // Path traversal check
    if (filePath.startsWith(clientDir) && fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          if (pathname.startsWith('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
          }
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      } catch (err) {
        console.error('Error reading static file:', err);
      }
    }
  }

  // Delegate all dynamic routes & server functions to TanStack Start SSR
  ssrHandler(req, res);
});

const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

server.listen(port, host, () => {
  console.log(`Safr server listening on http://${host}:${port}`);
});
