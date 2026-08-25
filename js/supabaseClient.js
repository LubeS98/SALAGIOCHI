// ============================================================
// CONFIGURAZIONE SUPABASE
// Sostituisci questi due valori con quelli del TUO progetto Supabase:
// Project Settings > API > Project URL / anon public key
// ============================================================
export const SUPABASE_URL = "https://fptpptacaqtgivzxdpuq.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdHBwdGFjYXF0Z2l2enhkcHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NzQ2OTAsImV4cCI6MjEwMzI1MDY5MH0.RE-aakPkQnYgQSK6rJ-dLK5bFdWrBRIu3u6f2MuHg84";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

export const isConfigured = () =>
  !SUPABASE_URL.includes("https://fptpptacaqtgivzxdpuq.supabase.co") &&
  !SUPABASE_ANON_KEY.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdHBwdGFjYXF0Z2l2enhkcHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NzQ2OTAsImV4cCI6MjEwMzI1MDY5MH0.RE-aakPkQnYgQSK6rJ-dLK5bFdWrBRIu3u6f2MuHg84");

// ---------- utilità comuni ----------
export function genCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function genId() {
  return crypto.randomUUID();
}

export const PLAYER_COLORS = [
  { name: "Rosso", hex: "#c0392b" },
  { name: "Blu", hex: "#2d6cb0" },
  { name: "Verde", hex: "#2f9e56" },
  { name: "Giallo", hex: "#d4a017" },
  { name: "Viola", hex: "#7d4bab" },
  { name: "Arancio", hex: "#d3701e" },
];

// LocalStorage: mantiene l'identità del giocatore corrente per ciascuna partita
export function savePlayerSession(gameId, playerId, name) {
  localStorage.setItem(`gh_session_${gameId}`, JSON.stringify({ playerId, name }));
}
export function getPlayerSession(gameId) {
  try {
    return JSON.parse(localStorage.getItem(`gh_session_${gameId}`));
  } catch {
    return null;
  }
}

export async function logHistory(gameId, playerId, playerName, action, message, payload = null) {
  await supabase.from("history").insert({
    game_id: gameId,
    player_id: playerId,
    player_name: playerName,
    action,
    message,
    payload,
  });
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
