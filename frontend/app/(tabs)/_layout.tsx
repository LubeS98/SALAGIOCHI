import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize } from "@/src/lib/theme";
import { useSession } from "@/src/lib/session";
import { View, ActivityIndicator } from "react-native";

export default function TabsLayout() {
  const { ready, me } = useSession();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>;
  if (!me) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceDim,
        tabBarStyle: {
          backgroundColor: colors.surface2,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "HUB", tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="pronostici" options={{ title: "PICKS", tabBarIcon: ({ color, size }) => <Ionicons name="ticket" size={size} color={color} /> }} />
      <Tabs.Screen name="board" options={{ title: "CLASSIFICA", tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "ALTRO", tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size} color={color} /> }} />
    </Tabs>
  );
}
