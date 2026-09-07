// Impacchetta tutto in un unico file HTML, pronto da pubblicare come Artifact.
//
// L'unione dei moduli è volutamente elementare: toglie le righe di import e la
// parola export, poi concatena nell'ordine delle dipendenze. Funziona perché in
// questo progetto nessun nome di primo livello si ripete tra i moduli. Se
// aggiungi un modulo, controlla che valga ancora.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const MODULES = [
  "src/model.js",
  "src/accounts.js",
  "src/auth.js",
  "src/config.js",
  "src/remote-supabase.js",
  "src/store.js",
  "src/ui.js",
  "src/main.js"
];

function stripModuleSyntax(source) {
  return source
    .replace(/^\s*import\s+\{[\s\S]*?\}\s+from\s+["'][^"']*["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']*["'];?\s*$/gm, "")
    .replace(/^export\s+/gm, "");
}

const html = await readFile(resolve(root, "index.html"), "utf8");
const css = await readFile(resolve(root, "src/styles.css"), "utf8");

const scripts = [];
for (const file of MODULES) {
  scripts.push("/* " + file + " */\n" + stripModuleSyntax(await readFile(resolve(root, file), "utf8")));
}

// L'artifact riceve il corpo della pagina: l'involucro <html>/<head>/<body>
// viene aggiunto in fase di pubblicazione, quindi qui si estrae il contenuto.
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) throw new Error("index.html: <body> non trovato");

const body = bodyMatch[1]
  .replace(/<script\s+type="module"[\s\S]*?<\/script>/gi, "")
  .trim();

const fonts = (html.match(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/gi) || []).join("\n");

const out = [
  "<title>Banco</title>",
  fonts,
  "<style>\n" + css + "\n</style>",
  "",
  body,
  "",
  "<script>\n(function () {\n\"use strict\";\n" + scripts.join("\n\n") + "\n})();\n</script>",
  ""
].join("\n");

await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/artifact.html"), out, "utf8");

console.log("dist/artifact.html — " + (out.length / 1024).toFixed(1) + " KB");
console.log("Pubblicalo come Artifact con la capability db per lo stato condiviso.");
