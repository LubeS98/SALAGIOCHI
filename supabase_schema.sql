-- ============================================================
-- RISIKO — schema Supabase
-- Da eseguire in: Project > SQL Editor > New query > Run
-- ============================================================

-- Estensione per generare UUID
create extension if not exists "pgcrypto";

-- ---------- games ----------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'risiko',
  code text not null unique,
  name text not null,
  status text not null default 'lobby',       -- lobby | playing | finished
  max_players int not null default 6,
  state jsonb not null default '{"phase":"lobby"}'::jsonb,
  winner_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- players ----------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  color text not null,
  seat int not null default 0,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- history ----------
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid,
  player_name text,
  action text,
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Indici utili per le query più frequenti del gioco
create index if not exists idx_players_game_id on public.players(game_id);
create index if not exists idx_history_game_id on public.history(game_id);
create index if not exists idx_games_status on public.games(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- Il gioco è ad accesso libero tramite codice tavolo (nessun login),
-- quindi apriamo lettura/scrittura pubblica tramite la chiave anon.
-- ============================================================
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.history enable row level security;

drop policy if exists "games_public_all" on public.games;
create policy "games_public_all" on public.games
  for all using (true) with check (true);

drop policy if exists "players_public_all" on public.players;
create policy "players_public_all" on public.players
  for all using (true) with check (true);

drop policy if exists "history_public_all" on public.history;
create policy "history_public_all" on public.history
  for all using (true) with check (true);

-- ============================================================
-- REALTIME
-- Necessario perché il gioco si aggiorna live tramite
-- supabase.channel(...).on("postgres_changes", ...)
-- Usiamo un blocco condizionale per evitare errori se una tabella
-- è già stata aggiunta alla pubblicazione in precedenza.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'history'
  ) then
    alter publication supabase_realtime add table public.history;
  end if;
end $$;
