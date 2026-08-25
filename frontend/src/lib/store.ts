// Supabase key-value store client compatible with FantaList Hub HTML app
const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
const TABLE = (process.env.EXPO_PUBLIC_SUPABASE_TABLE as string) || "fantalist_kv";

const H = () => ({
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=minimal",
  Accept: "application/json",
});

const url = (path: string) => `${URL_BASE.replace(/\/+$/, "")}/rest/v1/${TABLE}${path}`;

// The Supabase `v` column is TEXT — values are stored as JSON strings and
// must be parsed on read / stringified on write for compatibility with the
// shared FantaList Hub HTML app.
function parseV<T>(raw: any): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T; } catch { return raw as any as T; }
  }
  return raw as T;
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  const r = await fetch(url(`?k=eq.${encodeURIComponent(key)}&select=v`), { headers: H() });
  if (!r.ok) throw new Error(`kvGet ${key} ${r.status}`);
  const rows = (await r.json()) as { v: any }[];
  if (!rows?.length) return null;
  return parseV<T>(rows[0].v);
}

export async function kvSet(key: string, value: any): Promise<void> {
  const r = await fetch(url(""), {
    method: "POST",
    headers: H(),
    body: JSON.stringify([{ k: key, v: JSON.stringify(value) }]),
  });
  if (!r.ok) throw new Error(`kvSet ${key} ${r.status} ${await r.text()}`);
}

export async function kvDel(key: string): Promise<void> {
  const r = await fetch(url(`?k=eq.${encodeURIComponent(key)}`), { method: "DELETE", headers: H() });
  if (!r.ok) throw new Error(`kvDel ${key} ${r.status}`);
}

export async function kvList<T = any>(prefix: string): Promise<{ key: string; value: T }[]> {
  const r = await fetch(url(`?k=like.${encodeURIComponent(prefix + "%")}&select=k,v`), { headers: H() });
  if (!r.ok) throw new Error(`kvList ${prefix} ${r.status}`);
  const rows = (await r.json()) as { k: string; v: any }[];
  return rows.map((x) => ({ key: x.k, value: parseV<T>(x.v) as T }));
}

// Keys (compatible with the HTML app)
export const K = {
  user: (u: string) => `user-${u}`,
  claim: (playerId: string) => `claim-${playerId}`,
  core: "core",
  gmeta: (game: string) => `gmeta-${game}`,
  req: (game: string, round: number, playerId: string) => `req-${game}-${round}-${playerId}`,
  reqPrefix: (game: string, round: number) => `req-${game}-${round}-`,
  res: (round: number, teamId: string) => `res-${round}-${teamId}`,
  resPrefix: (round: number) => `res-${round}-`,
};
