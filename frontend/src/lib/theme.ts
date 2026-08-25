export const colors = {
  surface: "#121212",
  surface2: "#1C1C1E",
  surface3: "#27272A",
  onSurface: "#FFFFFF",
  onSurfaceMuted: "#A1A1AA",
  onSurfaceDim: "#71717A",
  border: "#27272A",
  borderStrong: "#3F3F46",
  brand: "#FF5500",
  brand2: "#FF7A33",
  brandDim: "#4D1A00",
  onBrand: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  chalk: "#F5F2EA",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;
export const fontSize = { xs: 11, sm: 12, base: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 32, "4xl": 44 } as const;
export const font = {
  display: undefined,
  displayWeight: "800" as const,
  text: undefined,
  textWeight: "500" as const,
};
