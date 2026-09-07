-- Schema della board su Supabase.
-- Incollalo nel pannello di Supabase, in SQL Editor, ed esegui una volta sola.

-- Una riga per task. Il contenuto resta il JSON prodotto da src/model.js,
-- così lo schema vive in un posto solo.
create table if not exists public.tasks (
  id         text primary key,
  board      text not null default 'quanova',
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists tasks_board_idx on public.tasks (board);

-- Una riga per board: l'elenco dei gruppi.
create table if not exists public.groups (
  board      text primary key,
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Senza questa riga le eliminazioni non arrivano agli altri browser: per
-- impostazione predefinita Postgres annuncia solo la chiave primaria, e il
-- filtro sulla board non riesce a valutarle.
alter table public.tasks replica identity full;

-- Aggiornamenti in tempo reale.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.groups;

-- Regole di accesso.
--
-- ATTENZIONE: così chiunque conosca l'indirizzo del progetto e la chiave
-- pubblica può leggere e scrivere la board. La chiave sta nel codice del sito,
-- quindi è alla portata di chi apre gli strumenti per sviluppatori. Va bene
-- per una board interna di due persone su un indirizzo che non pubblicizzi;
-- non va bene per dati riservati.
--
-- Per stringere: attiva Supabase Auth e sostituisci `to anon, authenticated`
-- con `to authenticated`. Da quel momento serve un vero accesso al posto del
-- cancello che gira nel browser.
alter table public.tasks  enable row level security;
alter table public.groups enable row level security;

drop policy if exists "board aperta in lettura e scrittura" on public.tasks;
create policy "board aperta in lettura e scrittura"
  on public.tasks for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "gruppi aperti in lettura e scrittura" on public.groups;
create policy "gruppi aperti in lettura e scrittura"
  on public.groups for all
  to anon, authenticated
  using (true)
  with check (true);
