// Serie A 2024-2025 teams demo data
export type Team = { id: string; name: string; color: string };
export type Player = { id: string; name: string };
export type Fixture = { round: number; home: string; away: string; home_score?: number; away_score?: number };

export const TEAMS: Team[] = [
  { id: "atalanta", name: "Atalanta", color: "#1B5EA6" },
  { id: "bologna", name: "Bologna", color: "#8E1B2E" },
  { id: "cagliari", name: "Cagliari", color: "#A3122B" },
  { id: "como", name: "Como", color: "#0B4DA2" },
  { id: "empoli", name: "Empoli", color: "#1E86C7" },
  { id: "fiorentina", name: "Fiorentina", color: "#6B32A0" },
  { id: "genoa", name: "Genoa", color: "#C8102E" },
  { id: "hellasverona", name: "Hellas Verona", color: "#F2C400" },
  { id: "inter", name: "Inter", color: "#1264B4" },
  { id: "juventus", name: "Juventus", color: "#D9D9D9" },
  { id: "lazio", name: "Lazio", color: "#7FC4EC" },
  { id: "lecce", name: "Lecce", color: "#E8B123" },
  { id: "milan", name: "Milan", color: "#E2071B" },
  { id: "monza", name: "Monza", color: "#D91C3D" },
  { id: "napoli", name: "Napoli", color: "#1C8FDB" },
  { id: "parma", name: "Parma", color: "#F4D53A" },
  { id: "roma", name: "Roma", color: "#8E1F2F" },
  { id: "torino", name: "Torino", color: "#7B2038" },
  { id: "udinese", name: "Udinese", color: "#B7B7B7" },
  { id: "venezia", name: "Venezia", color: "#E8722C" },
];

export const DEMO_PLAYERS: Player[] = [
  { id: "p-marco", name: "Marco" },
  { id: "p-luca", name: "Luca" },
  { id: "p-alessio", name: "Alessio" },
  { id: "p-giacomo", name: "Giacomo" },
  { id: "p-federico", name: "Federico" },
  { id: "p-simone", name: "Simone" },
  { id: "p-davide", name: "Davide" },
  { id: "p-matteo", name: "Matteo" },
];

// Round-robin scheduler creating a demo Serie A calendar (all 38 rounds)
function makeCalendar(): Fixture[] {
  const ids = TEAMS.map((t) => t.id);
  const n = ids.length; // 20
  const half = n / 2;
  const list: Fixture[] = [];
  const rotation = ids.slice(1);
  const fixed = ids[0];

  for (let r = 0; r < n - 1; r++) {
    const arr = [fixed, ...rotation];
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      // alternate home/away for balance
      const [h, a] = (r + i) % 2 === 0 ? [home, away] : [away, home];
      list.push({ round: r + 1, home: h, away: a });
    }
    // rotate
    rotation.unshift(rotation.pop() as string);
  }
  // reverse leg for rounds 20-38
  const first = list.slice();
  for (const f of first) {
    list.push({ round: f.round + 19, home: f.away, away: f.home });
  }
  return list;
}

export const CALENDAR: Fixture[] = makeCalendar();

export type MinigameKey = "lms1" | "lms2" | "whowin";
export const MINIGAMES: { key: MinigameKey; name: string; short: string; description: string; rounds: [number, number]; maxTeamUses: number }[] = [
  { key: "lms1", name: "Last Man Standing — Andata", short: "LMS A", description: "Scegli una squadra per giornata: se perde sei eliminato. Ogni squadra può essere usata al massimo 1 volta.", rounds: [1, 19], maxTeamUses: 1 },
  { key: "lms2", name: "Last Man Standing — Ritorno", short: "LMS R", description: "Ricomincia da capo: scegli una squadra a giornata, la sconfitta ti elimina.", rounds: [20, 38], maxTeamUses: 1 },
  { key: "whowin", name: "WhoWin?", short: "WW", description: "Scegli chi vincerà: puoi usare ogni squadra fino a 3 volte a stagione.", rounds: [1, 38], maxTeamUses: 3 },
];
