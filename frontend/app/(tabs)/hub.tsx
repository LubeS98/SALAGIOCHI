import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fontSize } from "@/src/lib/theme";
import { useSession } from "@/src/lib/session";
import { MINIGAMES } from "@/src/lib/data";

export default function HubScreen() {
  const { me, core, refreshCore } = useSession();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { refreshCore(); }, [refreshCore]));

  const onRefresh = async () => { setRefreshing(true); await refreshCore(); setRefreshing(false); };

  return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>CIAO {me?.displayName?.toUpperCase()}</Text>
          <Text style={s.title}>GIORNATA {core?.round ?? "—"}</Text>
        </View>
        {me?.role === "admin" && (
          <View style={s.adminChip} testID="admin-badge"><Text style={s.adminChipText}>ADMIN</Text></View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={s.section}>MINIGIOCHI ATTIVI</Text>
        {MINIGAMES.map((g) => (
          <TouchableOpacity key={g.key} testID={`mg-card-${g.key}`} style={s.card} activeOpacity={0.85} onPress={() => router.push({ pathname: "/pronostici", params: { game: g.key } })}>
            <View style={{ flex: 1 }}>
              <Text style={s.mgShort}>{g.short}</Text>
              <Text style={s.mgName}>{g.name}</Text>
              <Text style={s.mgDesc} numberOfLines={2}>{g.description}</Text>
              <View style={s.mgMeta}>
                <View style={s.badge}><Text style={s.badgeTxt}>ROUNDS {g.rounds[0]}–{g.rounds[1]}</Text></View>
                <View style={s.badge}><Text style={s.badgeTxt}>MAX USO {g.maxTeamUses}x</Text></View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceMuted} />
          </TouchableOpacity>
        ))}

        <Text style={[s.section, { marginTop: spacing.xl }]}>ALTRI MINIGIOCHI</Text>
        {["Undici 1v1", "Indovina il Calciatore", "Tiki Taka Toe", "Giocatore del Giorno"].map((n) => (
          <View key={n} style={[s.card, { opacity: 0.6 }]} testID={`soon-${n}`}>
            <View style={{ flex: 1 }}>
              <Text style={s.mgShort}>SOON</Text>
              <Text style={s.mgName}>{n}</Text>
              <Text style={s.mgDesc}>Disponibile nelle prossime versioni.</Text>
            </View>
            <Ionicons name="lock-closed" size={20} color={colors.onSurfaceDim} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  eyebrow: { color: colors.onSurfaceMuted, fontSize: fontSize.xs, letterSpacing: 1.5, fontWeight: "700" },
  title: { color: colors.onSurface, fontSize: fontSize["3xl"], fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  adminChip: { backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  adminChipText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1, fontSize: fontSize.xs },
  section: { color: colors.onSurfaceMuted, fontSize: fontSize.xs, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  mgShort: { color: colors.brand, fontSize: fontSize.xs, letterSpacing: 2, fontWeight: "800", marginBottom: 4 },
  mgName: { color: colors.onSurface, fontSize: fontSize.lg, fontWeight: "800", marginBottom: 4 },
  mgDesc: { color: colors.onSurfaceMuted, fontSize: fontSize.sm, lineHeight: 18 },
  mgMeta: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  badge: { backgroundColor: colors.surface3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  badgeTxt: { color: colors.onSurfaceMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});
