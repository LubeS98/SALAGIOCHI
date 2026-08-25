import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, fontSize } from "@/src/lib/theme";
import { useSession } from "@/src/lib/session";
import { Button } from "@/src/components/Button";

const HERO_IMG = "https://images.unsplash.com/photo-1763854413165-1713bc5a7f4a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Index() {
  const { ready, me, login, register } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => { setErr(null); }, [mode, username, password, displayName]);

  useEffect(() => {
    if (ready && me && !redirectedRef.current) {
      redirectedRef.current = true;
      setTimeout(() => { router.replace("/hub"); }, 0);
    }
    if (!me) redirectedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me]);

  if (!ready || me) return <View style={s.loader}><ActivityIndicator color={colors.brand} size="large" /></View>;

  const doSubmit = async () => {
    setErr(null);
    const uname = username.trim();
    const pass = password;
    const dname = displayName.trim() || uname;
    if (!uname) return setErr("Inserisci uno username");
    if (!pass) return setErr("Inserisci la password");
    setLoading(true);
    try {
      if (mode === "login") await login(uname, pass);
      else await register(uname, pass, dname);
    } catch (e: any) {
      const msg = e?.message || String(e) || "Errore sconosciuto";
      console.log("[auth] error:", msg);
      setErr(msg);
    } finally { setLoading(false); }
  };

  return (
    <View style={s.root}>
      <Image source={HERO_IMG} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      <LinearGradient colors={["rgba(18,18,18,0.35)", "rgba(18,18,18,0.85)", "#121212"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.brand}>
              <View style={s.dot} />
              <Text style={s.brandText}>FANTALIST HUB</Text>
            </View>
            <Text style={s.headline}>DOVE{"\n"}FANTACALCIO{"\n"}& LUDOPATIA{"\n"}<Text style={{ color: colors.brand }}>SI UNISCONO</Text></Text>
            <Text style={s.sub}>Pronostici. Minigiochi. Gloria eterna della lega.</Text>

            <View style={s.card} testID="auth-card">
              <View style={s.tabs}>
                <TouchableOpacity testID="tab-login" onPress={() => setMode("login")} style={[s.tab, mode === "login" && s.tabOn]}>
                  <Text style={[s.tabTxt, mode === "login" && s.tabTxtOn]}>ACCEDI</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="tab-register" onPress={() => setMode("register")} style={[s.tab, mode === "register" && s.tabOn]}>
                  <Text style={[s.tabTxt, mode === "register" && s.tabTxtOn]}>REGISTRATI</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>USERNAME</Text>
              <TextInput testID="input-username" value={username} onChangeText={setUsername} style={s.input} placeholder="es. marco" placeholderTextColor={colors.onSurfaceDim} autoCapitalize="none" autoCorrect={false} />

              {mode === "register" && (
                <>
                  <Text style={s.label}>NOME VISUALIZZATO</Text>
                  <TextInput testID="input-displayname" value={displayName} onChangeText={setDisplayName} style={s.input} placeholder="Come vuoi essere chiamato" placeholderTextColor={colors.onSurfaceDim} />
                </>
              )}

              <Text style={s.label}>PASSWORD</Text>
              <TextInput testID="input-password" value={password} onChangeText={setPassword} style={s.input} placeholder="••••••••" placeholderTextColor={colors.onSurfaceDim} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" />

              {err && <Text style={s.err} testID="auth-error">{err}</Text>}

              <Button testID="btn-submit-auth" title={loading ? (mode === "login" ? "Accesso in corso..." : "Creazione in corso...") : (mode === "login" ? "Entra" : "Crea account")} onPress={doSubmit} loading={loading} size="lg" style={{ marginTop: spacing.md }} />
              <Text style={s.help}>{mode === "login" ? "Il primo account creato diventa admin. Registrati per iniziare." : "Il primo utente registrato è l'admin della lega."}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loader: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, minHeight: "100%", justifyContent: "flex-end" },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  brandText: { color: colors.onSurface, fontSize: fontSize.sm, letterSpacing: 2, fontWeight: "800" },
  headline: { color: colors.onSurface, fontSize: 40, fontWeight: "900", lineHeight: 42, letterSpacing: -1 },
  sub: { color: colors.onSurfaceMuted, marginTop: spacing.sm, marginBottom: spacing.xl, fontSize: fontSize.base },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: "row", backgroundColor: colors.surface3, borderRadius: radius.pill, padding: 3, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.brand },
  tabTxt: { color: colors.onSurfaceMuted, fontWeight: "800", letterSpacing: 1, fontSize: fontSize.sm },
  tabTxtOn: { color: colors.onBrand },
  label: { color: colors.onSurfaceMuted, fontSize: fontSize.xs, letterSpacing: 1.5, marginBottom: spacing.xs, marginTop: spacing.sm, fontWeight: "700" },
  input: { backgroundColor: colors.surface, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.base },
  err: { color: colors.error, marginTop: spacing.md, fontSize: fontSize.sm },
  help: { color: colors.onSurfaceDim, textAlign: "center", marginTop: spacing.md, fontSize: fontSize.xs, lineHeight: 16 },
});
