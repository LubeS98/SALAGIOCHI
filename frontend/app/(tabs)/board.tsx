import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { colors, spacing, radius, fontSize } from "@/src/lib/theme";
import { useSession } from "@/src/lib/session";
import { MINIGAMES, MinigameKey } from "@/src/lib/data";
import { kvList, K } from "@/src/lib/store";

type LB = { playerId: string; playerName: string; picks: number; wins: number; losses: number; eliminated: boolean };

export default function BoardScreen() {
  const { core } = useSession();
  const [game, setGame] = useState<MinigameKey>("lms1");
  const [rows, setRows] = useState<LB[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!core) return;
    const g = MINIGAMES.find((m) => m.key === game)!;
    // Gather all approved picks per player
    const perPlayer: Record<string, { picks: number; wins: number; losses: number; eliminated: boolean }> = {};
    const results: Record<string, "W" | "L"> = {};
    for (let r = g.rounds[0]; r <= g.rounds[1]; r++) {
      const resPrefix = K.resPrefix(r);
      const resRows = await kvList<"W" | "L">(resPrefix);
      for (const { key, value } of resRows) {
        results[`${r}-${key.slice(resPrefix.length)}`] = value as any;
      }
      const reqPrefix = K.reqPrefix(g.key, r);
      const reqRows = await kvList<{ teamId: string; status: string }>(reqPrefix);
      for (const { key, value } of reqRows) {
        if (value.status !== "approved") continue;
        const pid = key.slice(reqPrefix.length);
        const rec = (perPlayer[pid] = perPlayer[pid] || { picks: 0, wins: 0, losses: 0, eliminated: false });
        rec.picks += 1;
        const res = results[`${r}-${value.teamId}`];
        if (res === "W") rec.wins += 1;
        else if (res === "L") { rec.losses += 1; if (g.key.startsWith("lms")) rec.eliminated = true; }
      }
    }
    const list: LB[] = core.players.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      picks: perPlayer[p.id]?.picks ?? 0,
      wins: perPlayer[p.id]?.wins ?? 0,
      losses: perPlayer[p.id]?.losses ?? 0,
      eliminated: perPlayer[p.id]?.eliminated ?? false,
    }));
    list.sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.losses - b.losses;
    });
    setRows(list);
  }, [core, game]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <View style={s.header}>
        <Text style={s.eyebrow}>CLASSIFICA</Text>
        <Text style={s.title}>LEADERBOARD</Text>
      </View>
      <View style={s.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {MINIGAMES.map((g) => (
            <TouchableOpacity key={g.key} testID={`board-chip-${g.key}`} onPress={() => setGame(g.key)} style={[s.chip, game === g.key && s.chipOn]}>
              <Text style={[s.chipTxt, game === g.key && s.chipTxtOn]}>{g.short}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={s.headRow}>
          <Text style={[s.h, { width: 32 }]}>#</Text>
          <Text style={[s.h, { flex: 1 }]}>GIOCATORE</Text>
          <Text style={[s.h, { width: 42, textAlign: "right" }]}>V</Text>
          <Text style={[s.h, { width: 42, textAlign: "right" }]}>P</Text>
          <Text style={[s.h, { width: 46, textAlign: "right" }]}>TOT</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.playerId} style={[s.row, r.eliminated && s.rowOut]} testID={`row-${r.playerId}`}>
            <Text style={[s.rank, i < 3 && { color: colors.brand }]}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{r.playerName}{r.eliminated ? "  ✕" : ""}</Text>
            </View>
            <Text style={[s.cell, { width: 42, textAlign: "right", color: colors.success }]}>{r.wins}</Text>
            <Text style={[s.cell, { width: 42, textAlign: "right", color: colors.error }]}>{r.losses}</Text>
            <Text style={[s.cell, { width: 46, textAlign: "right" }]}>{r.picks}</Text>
          </View>
        ))}
        {rows.length === 0 && <Text style={{ color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.xl }}>Nessun dato disponibile.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.surface },
  eyebrow: { color: colors.onSurfaceMuted, fontSize: fontSize.xs, letterSpacing: 1.5, fontWeight: "700" },
  title: { color: colors.onSurface, fontSize: fontSize["3xl"], fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  chipRow: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.onSurfaceMuted, fontWeight: "800", letterSpacing: 1, fontSize: fontSize.xs },
  chipTxtOn: { color: colors.onBrand },
  headRow: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  h: { color: colors.onSurfaceDim, fontSize: fontSize.xs, letterSpacing: 1.5, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, marginBottom: 6, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rowOut: { opacity: 0.45 },
  rank: { width: 32, color: colors.onSurface, fontSize: fontSize.xl, fontWeight: "900" },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: fontSize.base },
  cell: { color: colors.onSurface, fontWeight: "800", fontSize: fontSize.base },
});
