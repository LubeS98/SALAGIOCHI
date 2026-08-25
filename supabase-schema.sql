-- ============================================================
-- SALA DA GIOCO — schema Supabase per RISIKO & MONOPOLY online
-- ============================================================
-- Esegui questo intero file nel SQL Editor di Supabase
-- (Project > SQL Editor > New query > Run).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- TABELLA PARTITE ----------
create table if not exists games (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,              -- codice stanza a 5 lettere, es. "AB3XZ"
  type         text not null check (type in ('risiko','monopoly')),
  name         text not null default 'Partita senza nome',
  status       text not null default 'lobby' check (status in ('lobby','playing','finished')),
  state        jsonb not null default '{}'::jsonb, -- intero stato di gioco
  turn_index   int not null default 0,
  max_players  int not null default 6,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  winner_id    uuid
);

-- ---------- TABELLA GIOCATORI ----------
create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references games(id) on delete cascade,
  name         text not null,
  color        text not null,
  seat         int not null default 0,
  is_host      boolean not null default false,
  connected    boolean not null default true,
  last_seen    timestamptz not null default now(),
  joined_at    timestamptz not null default now()
);

-- ---------- STORICO / LOG EVENTI ----------
create table if not exists history (
  id           bigint generated always as identity primary key,
  game_id      uuid not null references games(id) on delete cascade,
  player_id    uuid references players(id) on delete set null,
  player_name  text,
  action       text not null,          -- es. 'attack', 'buy_property', 'end_turn'...
  message      text not null,          -- frase leggibile da mostrare nello storico
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_players_game on players(game_id);
create index if not exists idx_history_game on history(game_id, created_at);
create index if not exists idx_games_code on games(code);
create index if not exists idx_games_status on games(status, type);

-- ---------- updated_at automatico ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_games_updated on games;
create trigger trg_games_updated before update on games
for each row execute function set_updated_at();

-- ---------- ROW LEVEL SECURITY ----------
-- Il gioco è pensato per un gruppo di amici che condivide un link.
-- Abilitiamo RLS ma con policy permissive per la chiave "anon":
-- chiunque abbia l'URL del progetto può leggere/scrivere le partite.
-- (Se vuoi più sicurezza in futuro, sostituisci con policy legate ad auth.uid()).

alter table games enable row level security;
alter table players enable row level security;
alter table history enable row level security;

drop policy if exists "games_all" on games;
create policy "games_all" on games for all using (true) with check (true);

drop policy if exists "players_all" on players;
create policy "players_all" on players for all using (true) with check (true);

drop policy if exists "history_all" on history;
create policy "history_all" on history for all using (true) with check (true);

-- ---------- REALTIME ----------
-- Abilita la pubblicazione realtime sulle tre tabelle
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table history;

-- ============================================================
-- FINE SCRIPT. Dopo l'esecuzione, prendi da
-- Project Settings > API l'URL del progetto e la "anon public key"
-- e incollali in js/supabaseClient.js
-- ============================================================
