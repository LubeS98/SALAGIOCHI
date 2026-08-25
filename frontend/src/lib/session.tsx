import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { kvGet, kvSet, kvList, K } from "./store";
import { derive, randomHex, slug, DEFAULT_ITERATIONS, LEGACY_ITERATIONS } from "./crypto";
import { TEAMS, DEMO_PLAYERS, CALENDAR, MinigameKey } from "./data";

export type Role = "admin" | "player";
export type User = {
  username: string;
  displayName: string;
  role: Role;
  playerId?: string | null;
  saltHex: string;
  hashHex: string;
  iters?: number;
  createdAt: string;
};

export type CoreConfig = {
  createdAt: string;
  round: number;
  deadline: string | null;
  autoApprove: boolean;
  teams: { id: string; name: string; color: string }[];
  players: { id: string; name: string }[];
  calendar: { round: number; home: string; away: string; hs?: number; as?: number }[];
};

export type PronosticRequest = {
  teamId: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  sentAt: string;
  sentBy: string;
  decidedAt?: string;
  decidedBy?: string;
};

type Ctx = {
  ready: boolean;
  me: User | null;
  core: CoreConfig | null;
  login: (u: string, p: string) => Promise<User>;
  register: (u: string, p: string, displayName: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshCore: () => Promise<void>;
  seedIfNeeded: () => Promise<void>;
  submitPick: (game: MinigameKey, round: number, playerId: string, teamId: string) => Promise<void>;
  decidePick: (game: MinigameKey, round: number, playerId: string, status: "approved" | "rejected") => Promise<void>;
  setTeamResult: (round: number, teamId: string, result: "W" | "L") => Promise<void>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [core, setCore] = useState<CoreConfig | null>(null);

  const refreshCore = useCallback(async () => {
    const c = await kvGet<CoreConfig>(K.core);
    if (c) setCore(c);
  }, []);

  const seedIfNeeded = useCallback(async () => {
    let c = await kvGet<CoreConfig>(K.core);
    if (!c) {
      c = {
        createdAt: new Date().toISOString(),
        round: 1,
        deadline: null,
        autoApprove: false,
        teams: TEAMS,
        players: DEMO_PLAYERS,
        calendar: CALENDAR.map((f) => ({ round: f.round, home: f.home, away: f.away })),
      };
      await kvSet(K.core, c);
    }
    setCore(c);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem("fl-session");
        if (token) {
          const parts = token.split(":");
          const uname = parts[0];
          const u = await kvGet<User>(K.user(uname));
          if (u) setMe(u);
        }
        await seedIfNeeded();
      } catch (e) {
        console.log("init err", e);
      } finally {
        setReady(true);
      }
    })();
  }, [seedIfNeeded]);

  const login = async (username: string, password: string): Promise<User> => {
    const u = slug(username);
    if (!u) throw new Error("Username non valido");
    console.log("[auth] login attempt for", u);
    const rec = await kvGet<User>(K.user(u));
    if (!rec) throw new Error("Utente non trovato");
    const iters = rec.iters ?? LEGACY_ITERATIONS;
    console.log("[auth] deriving password with", iters, "iterations");
    const h = derive(password, rec.saltHex, iters);
    if (h !== rec.hashHex) throw new Error("Password errata");
    await AsyncStorage.setItem("fl-session", `${u}:${Date.now()}`);
    setMe(rec);
    console.log("[auth] login ok");
    return rec;
  };

  const register = async (username: string, password: string, displayName: string): Promise<User> => {
    const u = slug(username);
    if (!u) throw new Error("Username non valido");
    if (password.length < 4) throw new Error("Password troppo corta (min 4 caratteri)");
    console.log("[auth] register attempt for", u);
    const existing = await kvGet<User>(K.user(u));
    if (existing) throw new Error("Username già in uso");
    const users = await kvList<User>("user-");
    const isFirst = users.length === 0;
    const saltHex = randomHex(16);
    console.log("[auth] deriving password (register) with", DEFAULT_ITERATIONS, "iterations");
    const hashHex = derive(password, saltHex, DEFAULT_ITERATIONS);
    const finalName = displayName || username;
    // Prefer matching a demo player by slug; otherwise auto-create a new player and add to core.players
    let playerId: string | null = null;
    const matchingPlayer = DEMO_PLAYERS.find((p) => p.id.replace(/^p-/, "") === u);
    if (matchingPlayer) {
      playerId = matchingPlayer.id;
    } else {
      const c = (await kvGet<CoreConfig>(K.core)) ?? null;
      if (c) {
        playerId = `p-${u}`;
        if (!c.players.some((p) => p.id === playerId)) {
          c.players = [...c.players, { id: playerId, name: finalName }];
          await kvSet(K.core, c);
          setCore(c);
        }
      }
    }
    const rec: User = {
      username: u,
      displayName: finalName,
      role: isFirst ? "admin" : "player",
      playerId,
      saltHex,
      hashHex,
      iters: DEFAULT_ITERATIONS,
      createdAt: new Date().toISOString(),
    };
    await kvSet(K.user(u), rec);
    if (rec.playerId) await kvSet(K.claim(rec.playerId), u);
    await AsyncStorage.setItem("fl-session", `${u}:${Date.now()}`);
    setMe(rec);
    console.log("[auth] register ok");
    return rec;
  };

  const logout = async () => {
    await AsyncStorage.removeItem("fl-session");
    setMe(null);
  };

  const submitPick: Ctx["submitPick"] = async (game, round, playerId, teamId) => {
    if (!me) throw new Error("Non autenticato");
    const rec: PronosticRequest = {
      teamId,
      status: core?.autoApprove || me.role === "admin" ? "approved" : "pending",
      sentAt: new Date().toISOString(),
      sentBy: me.username,
    };
    if (rec.status === "approved") {
      rec.decidedAt = rec.sentAt;
      rec.decidedBy = me.username;
    }
    await kvSet(K.req(game, round, playerId), rec);
  };

  const decidePick: Ctx["decidePick"] = async (game, round, playerId, status) => {
    if (!me) throw new Error("Non autenticato");
    const cur = await kvGet<PronosticRequest>(K.req(game, round, playerId));
    if (!cur) throw new Error("Nessuna richiesta");
    cur.status = status;
    cur.decidedAt = new Date().toISOString();
    cur.decidedBy = me.username;
    await kvSet(K.req(game, round, playerId), cur);
  };

  const setTeamResult: Ctx["setTeamResult"] = async (round, teamId, result) => {
    await kvSet(K.res(round, teamId), result);
  };

  return (
    <SessionCtx.Provider value={{ ready, me, core, login, register, logout, refreshCore, seedIfNeeded, submitPick, decidePick, setTeamResult }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
}
