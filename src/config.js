// Dove salvare i dati.
//
// Vuoto: la board vive nel browser di chi la apre (localStorage), e se la
// pagina è pubblicata come Artifact di Claude usa il database dell'artifact.
//
// Compilato: la board vive su Supabase, quindi è la stessa per tutti quelli
// che aprono il sito — è ciò che serve per il deploy su Vercel.
//
// I due valori si trovano nel pannello di Supabase, in
// Project Settings → API: "Project URL" e la chiave pubblica "anon".
//
// La chiave anon è pensata per stare nel codice del browser: non è un
// segreto. Chi comanda davvero sono le regole di accesso (RLS) che imposti
// sul database — vedi supabase/schema.sql.

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

/** Permette a più board di convivere sullo stesso progetto Supabase. */
export const BOARD_ID = "quanova";

export function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
