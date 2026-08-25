import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fontSize } from "@/src/lib/theme";
import { useSession } from "@/src/lib/session";
import { MINIGAMES, MinigameKey } from "@/src/lib/data";
import { kvGet, kvList, kvSet, K } from "@/src/lib/store";
import { Button } from "@/src/components/Button";

type Req = { teamId: string; status: string; sentBy?: string };

export default function MoreScreen() {
  const { me, core, logout, refreshCore, decidePick, setTeamResult } = useSession();
  const router = useRouter();
  const [screen, setScreen] = useState<"home" | "rules" | "requests" | "results" | "calendar">("home");
  const [pending, setPending] = useState<{ key: string; game: MinigameKey; round: number; playerId: string; req: Req }[]>([]);
  const [resultRound, setResultRound] = useState<number>(core?.round ?? 1);
  const [results, setResults] = useState<Record<string, "W" | "L">>({});

  const loadPending = useCallback(async () => {
    if (!core) return;
    const items: any[] = [];
    for (const g of MINIGAMES) {
      const rows = await kvList<Req>(K.reqPrefix(g.key, core.round));
      for (const { key, value } of rows) {
        if (value.status === "pending") {
          const pid = key.slice(K.reqPrefix(g.key, core.round).length);
          items.push({ key, game: g.key, round: core.round, playerId: pid, req: value });
        }
      }
    }
    setPending(items);
  }, [core]);

  const loadResults = useCallback(async () => {
    const rows = await kvList<"W" | "L">(K.resPrefix(resultRound));
    const map: Record<string, "W" | "L"> = {};
    for (const { key, value } of rows) map[key.slice(K.resPrefix(resultRound).length)] = value as any;
    setResults(map);
  }, [resultRound]);

  useFocusEffect(useCallback(() => { if (screen === "requests") loadPending(); if (screen === "results") loadResults(); }, [screen, loadPending, loadResults]));

  const advanceRound = async () => {
    if (!core) return;
    const next = Math.min(38, core.round + 1);
    const c = { ...core, round: next };
    await kvSet(K.core, c);
    await refreshCore();
    Alert.alert("Giornata", `Passata a giornata ${next}`);
  };

  const decide = async (item: any, status: "approved" | "rejected") => {
    await decidePick(item.game, item.round, item.playerId, status);
    await loadPending();
  };

  const toggleResult = async (teamId: string) => {
    const cur = results[teamId];
    const next = cur === "W" ? "L" : cur === "L" ? undefined : "W";
    if (next) await setTeamResult(resultRound, teamId, next);
    else { const { kvDel } = await import("@/src/lib/store"); await kvDel(K.res(resultRound, teamId)); }
    await loadResults();
  };

  if (screen === "home") return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <View style={s.header}><Text style={s.eyebrow}>MENU</Text><Text style={s.title}>ALTRO</Text></View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <Section label="ACCOUNT">
          <Row testID="profile-row" icon="person-circle" title={me?.displayName || ""} sub={`@${me?.username} · ${me?.role.toUpperCase()}`} />
          <Row testID="logout-row" icon="log-out" title="Esci" onPress={async () => { await logout(); router.replace("/"); }} />
        </Section>
        <Section label="INFO">
          <Row testID="rules-row" icon="book" title="Regole" onPress={() => setScreen("rules")} />
          <Row testID="calendar-row" icon="calendar" title="Calendario" onPress={() => setScreen("calendar")} />
        </Section>
        {me?.role === "admin" && (
          <Section label="ADMIN">
            <Row testID="requests-row" icon="checkmark-done" title="Richieste da approvare" onPress={() => setScreen("requests")} />
            <Row testID="results-row" icon="podium" title="Inserisci risultati" onPress={() => setScreen("results")} />
            <Row testID="advance-row" icon="play-forward" title={`Avanza a Giornata ${(core?.round ?? 0) + 1}`} onPress={advanceRound} />
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === "rules") return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <Header title="REGOLE" onBack={() => setScreen("home")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {MINIGAMES.map((g) => (
          <View key={g.key} style={s.ruleCard}>
            <Text style={s.ruleShort}>{g.short}</Text>
            <Text style={s.ruleName}>{g.name}</Text>
            <Text style={s.ruleDesc}>{g.description}</Text>
            <Text style={s.ruleMeta}>Giornate {g.rounds[0]}–{g.rounds[1]} · Max uso squadra: {g.maxTeamUses}x</Text>
          </View>
        ))}
        <View style={s.ruleCard}>
          <Text style={s.ruleShort}>GENERALE</Text>
          <Text style={s.ruleName}>Come funziona</Text>
          <Text style={s.ruleDesc}>Ogni giornata scegli le tue squadre. L'admin approva le scelte e inserisce i risultati (W/L). La classifica si aggiorna automaticamente.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === "requests") return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <Header title={`RICHIESTE G${core?.round}`} onBack={() => setScreen("home")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {pending.length === 0 && <Text style={s.empty}>Nessuna richiesta in sospeso.</Text>}
        {pending.map((it) => (
          <View key={it.key} style={s.reqCard} testID={`req-${it.key}`}>
            <View style={{ flex: 1 }}>
              <Text style={s.reqEyebrow}>{MINIGAMES.find((m) => m.key === it.game)?.short}</Text>
              <Text style={s.reqTitle}>{core?.players.find((p) => p.id === it.playerId)?.name || it.playerId} → {core?.teams.find((t) => t.id === it.req.teamId)?.name}</Text>
            </View>
            <TouchableOpacity onPress={() => decide(it, "rejected")} style={[s.rBtn, { backgroundColor: colors.error }]} testID={`rej-${it.key}`}><Ionicons name="close" color="#fff" size={18} /></TouchableOpacity>
            <TouchableOpacity onPress={() => decide(it, "approved")} style={[s.rBtn, { backgroundColor: colors.success }]} testID={`app-${it.key}`}><Ionicons name="checkmark" color="#fff" size={18} /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === "results") return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <Header title={`RISULTATI G${resultRound}`} onBack={() => setScreen("home")} />
      <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, alignItems: "center", justifyContent: "center" }}>
        <TouchableOpacity onPress={() => { setResultRound((r) => Math.max(1, r - 1)); }} style={s.smallBtn}><Ionicons name="chevron-back" color="#fff" size={16} /></TouchableOpacity>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: fontSize.lg, minWidth: 60, textAlign: "center" }}>G{resultRound}</Text>
        <TouchableOpacity onPress={() => { setResultRound((r) => Math.min(38, r + 1)); }} style={s.smallBtn}><Ionicons name="chevron-forward" color="#fff" size={16} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <Text style={s.help}>Tocca una squadra per ciclare: Nessuno → V → P → Nessuno</Text>
        <View style={{ marginTop: spacing.md, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(core?.teams ?? []).map((t) => {
            const v = results[t.id];
            const bg = v === "W" ? colors.success : v === "L" ? colors.error : colors.surface2;
            return (
              <TouchableOpacity key={t.id} testID={`res-${t.id}`} onPress={() => toggleResult(t.id)} style={[s.team, { backgroundColor: bg, borderColor: v ? bg : colors.border }]}>
                <View style={[s.teamDot, { backgroundColor: t.color }]} />
                <Text style={[s.teamName, v && { color: "#fff" }]} numberOfLines={1}>{t.name}</Text>
                <Text style={[s.teamRes, v && { color: "#fff" }]}>{v ?? "—"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === "calendar") {
    const round = core?.round ?? 1;
    const fixtures = (core?.calendar ?? []).filter((f) => f.round === round);
    const nameOf = (id: string) => core?.teams.find((t) => t.id === id)?.name || id;
    return (
      <SafeAreaView edges={["top"]} style={s.root}>
        <Header title={`CALENDARIO G${round}`} onBack={() => setScreen("home")} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          {fixtures.map((f, i) => (
            <View key={i} style={s.fixture} testID={`fix-${i}`}>
              <Text style={s.fixTeam}>{nameOf(f.home)}</Text>
              <Text style={s.fixVs}>vs</Text>
              <Text style={[s.fixTeam, { textAlign: "right" }]}>{nameOf(f.away)}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return null;
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.backBtn} testID="back-btn"><Ionicons name="arrow-back" color={colors.onSurface} size={20} /></TouchableOpacity>
      <Text style={[s.title, { fontSize: fontSize.xl }]}>{title}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

function Row({ icon, title, sub, onPress, testID }: { icon: any; title: string; sub?: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} testID={testID} activeOpacity={onPress ? 0.7 : 1} style={s.row}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceDim} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.onSurfaceMuted, fontSize: fontSize.xs, letterSpacing: 1.5, fontWeight: "700" },
  title: { color: colors.onSurface, fontSize: fontSize["3xl"], fontWeight: "900", letterSpacing: -1 },
  sectionLabel: { color: colors.onSurfaceDim, fontSize: fontSize.xs, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.sm, marginLeft: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowTitle: { color: colors.onSurface, fontSize: fontSize.base, fontWeight: "700" },
  rowSub: { color: colors.onSurfaceMuted, fontSize: fontSize.sm, marginTop: 2 },
  ruleCard: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.brand },
  ruleShort: { color: colors.brand, fontSize: fontSize.xs, letterSpacing: 2, fontWeight: "800" },
  ruleName: { color: colors.onSurface, fontSize: fontSize.lg, fontWeight: "900", marginVertical: 6 },
  ruleDesc: { color: colors.onSurfaceMuted, fontSize: fontSize.sm, lineHeight: 20 },
  ruleMeta: { color: colors.onSurfaceDim, fontSize: 11, marginTop: 8, letterSpacing: 0.5 },
  empty: { color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.xl },
  reqCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  reqEyebrow: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  reqTitle: { color: colors.onSurface, fontWeight: "700", marginTop: 2 },
  rBtn: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  team: { width: "48%", flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  teamName: { color: colors.onSurface, fontWeight: "700", fontSize: fontSize.sm, flex: 1 },
  teamRes: { color: colors.onSurfaceMuted, fontWeight: "900", fontSize: fontSize.base },
  smallBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  help: { color: colors.onSurfaceMuted, fontSize: fontSize.sm },
  fixture: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, marginBottom: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  fixTeam: { flex: 1, color: colors.onSurface, fontWeight: "700", fontSize: fontSize.base },
  fixVs: { color: colors.onSurfaceDim, marginHorizontal: spacing.sm, fontWeight: "800", fontSize: fontSize.sm },
});
