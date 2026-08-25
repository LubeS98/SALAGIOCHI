import { StyleSheet, TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from "react-native";
import { colors, radius, spacing, fontSize } from "@/src/lib/theme";

type Props = {
  onPress?: () => void;
  title: string;
  variant?: "primary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  size?: "md" | "sm" | "lg";
  style?: ViewStyle;
};

export function Button({ onPress, title, variant = "primary", disabled, loading, testID, size = "md", style }: Props) {
  const bg: Record<string, string> = {
    primary: colors.brand,
    ghost: "transparent",
    danger: colors.error,
    success: colors.success,
  };
  const fg: Record<string, string> = {
    primary: colors.onBrand,
    ghost: colors.onSurface,
    danger: colors.onBrand,
    success: colors.onBrand,
  };
  const p: Record<string, ViewStyle> = {
    md: { paddingVertical: 12, paddingHorizontal: 18 },
    sm: { paddingVertical: 8, paddingHorizontal: 12 },
    lg: { paddingVertical: 16, paddingHorizontal: 22 },
  };
  const fs: Record<string, TextStyle> = {
    md: { fontSize: fontSize.base },
    sm: { fontSize: fontSize.sm },
    lg: { fontSize: fontSize.lg },
  };
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        p[size],
        { backgroundColor: bg[variant], opacity: disabled ? 0.5 : 1 },
        variant === "ghost" && { borderColor: colors.borderStrong, borderWidth: 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={[styles.txt, fs[size], { color: fg[variant] }]}>{title.toUpperCase()}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  txt: { fontWeight: "800", letterSpacing: 0.6 },
});
