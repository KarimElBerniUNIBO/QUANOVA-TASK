// Scrive src/config.js a partire dalle variabili d'ambiente.
//
// Lo lancia Vercel a ogni deploy: così le chiavi di Supabase stanno nelle
// impostazioni del progetto e non nel repo. In locale non serve — se le
// variabili non ci sono, il file resta quello che è.
//
// Variabili lette: SUPABASE_URL, SUPABASE_ANON_KEY, BOARD_ID (facoltativa).

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_ANON_KEY || "";
const board = process.env.BOARD_ID || "quanova";

if (!url || !key) {
  console.log("SUPABASE_URL o SUPABASE_ANON_KEY mancanti: src/config.js resta invariato.");
  console.log("Il sito funzionerà, ma ogni browser avrà la sua board separata.");
  process.exit(0);
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
  console.error("SUPABASE_URL non ha la forma attesa: https://xxxx.supabase.co");
  process.exit(1);
}

const cleanUrl = url.replace(/\/+$/, "");

const file = `// Generato da scripts/config-from-env.mjs durante il deploy.
// Non modificarlo a mano: le modifiche vengono sovrascritte al deploy
// successivo. I valori si cambiano nelle variabili d'ambiente del progetto.

export const SUPABASE_URL = ${JSON.stringify(cleanUrl)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(key)};
export const BOARD_ID = ${JSON.stringify(board)};

export function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
`;

await writeFile(resolve(root, "src/config.js"), file, "utf8");
console.log("src/config.js generato — board «" + board + "» su " + url);
