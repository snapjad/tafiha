// Local-only preview. Serve the public app, never repository/configuration files.
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const publicPath = /^(?:(?:index|privacy|terms|delete-account|admin)\.html|manifest\.webmanifest|sw\.js|css\/[a-zA-Z0-9_-]+\.css|js\/(?:vendor\/|admin\/)?[a-zA-Z0-9_-]+\.js|assets\/(?:icons\/|brand\/|store\/)?[a-zA-Z0-9_-]+\.(?:png|webp|svg)|assets\/fonts\/[a-z0-9-]+\.woff2)$/;

export async function createPreview() {
  const realRoot = await realpath(root);
  const index = await readFile(resolve(root, 'index.html'), 'utf8');
  const csp = index.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  if (!csp) throw new Error('Missing content security policy');
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', `${csp}; frame-ancestors 'none'`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.host !== `127.0.0.1:${res.socket.localPort}` && req.headers.host !== `localhost:${res.socket.localPort}`) {
      res.writeHead(403); res.end(); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html';
      if (!publicPath.test(path)) { res.writeHead(404); res.end(); return; }
      const file = await realpath(resolve(root, path));
      if (!file.startsWith(realRoot + sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(path)], 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 5186);
  const server = await createPreview();
  server.listen(port, '127.0.0.1', () => console.log(`Tafiha preview: http://127.0.0.1:${port}/`));
}
