// Local preview: `npm install && npm run dev` -> http://localhost:8888/matjip/
// Serves the static site and runs netlify/functions/*.mjs for /api/* routes.
// Put keys in a .env file next to this one (see matjip/README.md).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, '.env'))) {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mp4': 'video/mp4', '.webp': 'image/webp' };
const port = Number(process.env.PORT) || 8888;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    const api = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (api) {
      const file = path.join(root, 'netlify/functions', `${api[1]}.mjs`);
      if (!existsSync(file)) { res.writeHead(404).end(); return; }
      const mod = await import(pathToFileURL(file).href);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const r = await mod.default(request);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(p).catch(() => null))?.isDirectory()) p = path.join(p, 'index.html');
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' }).end(String(e.message));
  }
}).listen(port, () => console.log(`http://localhost:${port}/matjip/`));
