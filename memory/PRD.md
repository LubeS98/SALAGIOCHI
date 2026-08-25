# FantaList Hub — Mobile

A React Native / Expo mobile port of the FantaList Hub HTML fantasy football minigame platform (Serie A Italian fantacalcio).

## Stack
- Expo Router (file-based routing) + React Native + TypeScript
- Supabase KV table `fantalist_kv` (compatible with original HTML app, shared storage)
- Auth: Custom username/password with PBKDF2-SHA256 (150k iterations) via crypto-js. Compatible hashes with original HTML.
- Session cached via AsyncStorage

## Features (v1)
- Auth Gate: Login + Register (first user becomes admin, others "player")
- Dashboard (Hub): active minigames cards + "coming soon" for advanced minigames
- Pronostici: pick a team per giornata for LMS Andata, LMS Ritorno, WhoWin?. Shows current pick + status + team usage counter.
- Board: leaderboard per minigame, ranks by wins then losses; shows elimination for LMS
- More menu:
  - Rules (all minigames explained)
  - Calendar (Serie A fixtures per round)
  - Admin-only: pending pick requests (approve/reject), team results (W/L per round), advance round
  - Profile & logout

## Data model (Supabase KV)
- `user-<username>`: {username, displayName, role, playerId, saltHex, hashHex, createdAt}
- `claim-<playerId>`: username claim
- `core`: {round, deadline, autoApprove, teams[], players[], calendar[]}
- `req-<game>-<round>-<playerId>`: pick request {teamId, status, sentAt, sentBy, decidedAt}
- `res-<round>-<teamId>`: "W" | "L"

## Deferred (future iterations)
- Minigames: Undici 1v1, Indovina il Calciatore, Tiki Taka Toe, Giocatore del Giorno
- Excel import/export
- ESPN scoreboard sync
- Push notifications
