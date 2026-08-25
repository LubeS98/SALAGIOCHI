import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import { colors, spacing, radius, fontSize } from "@/src/lib/theme";
import { useSession } from "@/src/lib/session";
import { MINIGAMES, MinigameKey } from "@/src/lib/data";
import { kvGet, kvList, K } from "@/src/lib/store";
import { Button } from "@/src/components/Button";

type PickState = Record<string, { teamId: string; status: string } | null>;

export default function PronosticiScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const { me, core, submitPick } = useSession();
  const [game, setGame] = useState<MinigameKey>((params.game as MinigameKey) || "lms1");
  const [myPick, setMyPick] = useState<PickState>({});
  const [usedByGame, setUsedByGame] = useState<Record<MinigameKey, Record<string, number>>>({} as any);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTeam, setBusyTeam] = useState<string | null>(null);

  useEffect(() => { if (params.game) setGame(params.game as MinigameKey); }, [params.game]);

  const currentGame = MINIGAMES.find((m) => m.key === game)!;
  const round = core?.round ?? 1;
  const withinRange = round >= currentGame.rounds[0] && round <= currentGame.rounds[1];
  const playerId = me?.playerId;

  const load = useCallback(async () => {
    if (!me?.playerId || !core) return;
    // Load my current pick per game for current round
    const picks: PickState = {};
    for (const g of MINIGAMES) {
      const r = await kvGet<{ teamId: string; status: string }>(K.req(g.key, core.round, me.playerId));
      picks[g.key] = r ?? null;
    }
    setMyPick(picks);
    // Load usage counts across all rounds in game range
    const usage: Record<MinigameKey, Record<string, number>> = {} as any;
    for (const g of MINIGAMES) {
      const map: Record<string, number> = {};
      for (let r = g.rounds[0]; r <= g.rounds[1]; r++) {
        const prefix = K.reqPrefix(g.key, r);
        const rows = await kvList<{ teamId: string; status: string }>(prefix);
        for (const { key, value } of rows) {
          const pid = key.slice(prefix.length);
          if (pid === me.playerId && value.status !== "rejected") {
            map[value.teamId] = (map[value.teamId] || 0) + 1;
          }
        }
      }
      usage[g.key] = map;
    }
    setUsedByGame(usage);
  }, [me, core]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const teams = core?.teams ?? [];
  const usage = usedByGame[game] || {};

  const isTeamDisabled = (teamId: string) => {
    const u = usage[teamId] || 0;
    // if already picked this round, still allow display, don't disable
    const existing = myPick[game]?.teamId === teamId;
    if (existing) return false;
    return u >= currentGame.maxTeamUses;
  };

  const pick = async (teamId: string) => {
    if (!playerId) return Alert.alert("Utente senza player", "Registrati con un username che corrisponde a un player della lega.");
    if (!withinRange) return;
    setBusyTeam(teamId);
    try {
      await submitPick(game, round, playerId, teamId);
      await load();
    } catch (e: any) {
      Alert.alert("Errore", e?.message || "Impossibile inviare");
    } finally { setBusyTeam(null); }
  };

  const current = myPick[game];

  return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <View style={s.header}>
        <Text style={s.eyebrow}>MY PICKS</Text>
        <Text style={s.title}>GIORNATA {round}</Text>
      </View>

      <View style={s.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {MINIGAMES.map((g) => (
            <TouchableOpacity key={g.key} testID={`chip-${g.key}`} onPress={() => setGame(g.key)} style={[s.chip, game === g.key && s.chipOn]}>
              <Text style={[s.chipTxt, game === g.key && s.chipTxtOn]}>{g.short}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={s.mgName}>{currentGame.name}</Text>
        <Text style={s.mgDesc}>{currentGame.description}</Text>

        {!playerId && (
          <View style={s.banner}><Text style={s.bannerText}>Il tuo account non è collegato a un player della lega. Prova a registrarti con un username come "marco", "luca", ecc. (demo players).</Text></View>
        )}
        {!withinRange && (
          <View style={s.banner}><Text style={s.bannerText}>Questo minigioco non è attivo alla giornata {round}.</Text></View>
        )}

        {current && (
          <View style={s.slip} testID="my-current-pick">
            <Text style={s.slipEyebrow}>LA TUA SCELTA</Text>
            <Text style={s.slipTeam}>{teams.find((t) => t.id === current.teamId)?.name?.toUpperCase() ?? current.teamId}</Text>
            <View style={[s.statusPill, current.status === "approved" && { backgroundColor: colors.success }, current.status === "rejected" && { backgroundColor: colors.error }]}>
              <Text style={s.statusTxt}>{current.status === "pending" ? "IN ATTESA" : current.status === "approved" ? "APPROVATO" : "RIFIUTATO"}</Text>
            </View>
          </View>
        )}

        <Text style={[s.section, { marginTop: spacing.xl }]}>SCEGLI UNA SQUADRA</Text>
        <View style={s.grid}>
          {teams.map((t) => {
            const used = usage[t.id] || 0;
            const disabled = isTeamDisabled(t.id) || !withinRange || !playerId;
            const selected = current?.teamId === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                testID={`team-${t.id}`}
                onPress={() => pick(t.id)}
                disabled={disabled || busyTeam !== null}
                style={[s.team, selected && s.teamOn, disabled && { opacity: 0.35 }]}
                activeOpacity={0.7}
              >
                <View style={[s.teamDot, { backgroundColor: t.color }]} />
                <Text style={[s.teamName, selected && { color: colors.onBrand }]} numberOfLines={1}>{t.name}</Text>
                <Text style={[s.teamUse, selected && { color: colors.onBrand }]}>{used}/{currentGame.maxTeamUses}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  mgName: { color: colors.onSurface, fontSize: fontSize.xl, fontWeight: "900" },
  mgDesc: { color: colors.onSurfaceMuted, fontSize: fontSize.sm, lineHeight: 18, marginTop: spacing.xs, marginBottom: spacing.md },
  banner: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: colors.warning, borderWidth: 1, borderLeftWidth: 3, padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.md },
  bannerText: { color: colors.warning, fontSize: fontSize.sm },
  slip: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.brand },
  slipEyebrow: { color: colors.brand, fontSize: fontSize.xs, letterSpacing: 2, fontWeight: "800" },
  slipTeam: { color: colors.onSurface, fontSize: fontSize["2xl"], fontWeight: "900", marginTop: 4 },
  statusPill: { alignSelf: "flex-start", marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.warning },
  statusTxt: { color: "#000", fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  section: { color: colors.onSurfaceMuted, fontSize: fontSize.xs, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  team: { width: "48%", flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  teamOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  teamName: { color: colors.onSurface, fontWeight: "700", fontSize: fontSize.sm, flex: 1 },
  teamUse: { color: colors.onSurfaceMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
});
