// Genera la riga di un account da incollare in src/accounts.js.
//
//   node scripts/hash-password.mjs email@dominio.it "Nome mostrato" "password"
//
// La password non viene mai salvata: resta solo il risultato di PBKDF2, che
// non si può riportare indietro. Cambiare password significa rigenerare la
// riga con questo comando e sostituirla nel file.

import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const [email, name, password] = process.argv.slice(2);

if (!email || !name || !password) {
  console.error('Uso: node scripts/hash-password.mjs email@dominio.it "Nome" "password"');
  process.exit(1);
}

if (password.length < 8) {
  console.error("La password deve avere almeno 8 caratteri.");
  process.exit(1);
}

const salt = randomBytes(SALT_LENGTH);
const hash = pbkdf2Sync(password.normalize("NFKC"), salt, ITERATIONS, KEY_LENGTH, "sha256");

const record = {
  email: email.trim().toLowerCase(),
  name: name.trim(),
  salt: salt.toString("hex"),
  hash: hash.toString("hex"),
  iterations: ITERATIONS
};

console.log("Incolla questa voce nell'array ACCOUNTS di src/accounts.js:\n");
console.log("  " + JSON.stringify(record, null, 2).replace(/\n/g, "\n  ") + ",");
