// Server statico minimo: i moduli ES non si caricano da file://, serve http.
// Nessuna dipendenza — solo la libreria standard di Node.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const port = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (path === "/") path = "/index.html";

  // Nessuna risalita fuori dalla cartella del progetto.
  const target = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  if (!target.startsWith(root)) {
    res.writeHead(403).end("Vietato");
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[extname(target)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Non trovato: " + path);
  }
});

server.listen(port, () => {
  console.log("Banco è su http://localhost:" + port);
});
