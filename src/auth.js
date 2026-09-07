// Accesso alla board.
//
// COSA FA: tiene fuori chi arriva per caso e dà a ogni modifica il nome di
// chi l'ha fatta, senza doverlo digitare.
//
// COSA NON FA: non protegge i dati. Il controllo gira nel browser di chi apre
// la pagina, quindi chi sa usare gli strumenti per sviluppatori lo aggira e
// legge comunque la board. La vera barriera è chi può aprire l'artifact.
// Non metterci dentro niente che non potrebbe leggere.

import { ACCOUNTS } from "./accounts.js";

const SESSION_KEY = "banco.session.v1";
const SESSION_DAYS = 30;
const KEY_BITS = 256;

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Confronto a tempo costante: non rivela quanti caratteri combaciano. */
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function cryptoAvailable() {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

async function derive(password, saltHex, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
    material,
    KEY_BITS
  );
  return toHex(bits);
}

/** Restituisce { email, name } se le credenziali sono giuste, altrimenti null. */
export async function verify(email, password) {
  const wanted = String(email || "").trim().toLowerCase();
  const account = ACCOUNTS.find(a => a.email === wanted);

  // Anche senza account si calcola comunque un hash, così un'email
  // sconosciuta non risponde più in fretta di una password sbagliata.
  const reference = account || ACCOUNTS[0];
  if (!reference) return null;

  const computed = await derive(String(password || ""), reference.salt, reference.iterations);
  if (!account) return null;
  if (!sameHash(computed, account.hash)) return null;

  return { email: account.email, name: account.name };
}

export function readSession() {
  let raw;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    const age = Date.now() - Date.parse(session.at);
    if (!Number.isFinite(age) || age > SESSION_DAYS * 86400000) return null;
    // Un account rimosso da accounts.js perde subito la sessione.
    const account = ACCOUNTS.find(a => a.email === session.email);
    return account ? { email: account.email, name: account.name } : null;
  } catch (e) {
    return null;
  }
}

export function writeSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      email: user.email,
      at: new Date().toISOString()
    }));
  } catch (e) {
    /* la sessione dura finché resta aperta la pagina */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    /* ignora */
  }
}
