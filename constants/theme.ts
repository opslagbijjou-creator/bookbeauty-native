export const COLORS = {
  bg: "#ffffff",
  card: "#ffffff",
  border: "#e9e9ec",
  text: "#111111",
  muted: "#6b6b6b",
  placeholder: "#9a9aa1",
  primary: "#111111",
  primarySoft: "#f3f3f4",
  danger: "#c24164",
  success: "#157347",
  surface: "#f7f7f8",
  accent: "#d78aa9",
  accentSoft: "#faeff4",
};

export const RADII = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const SHADOWS = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  soft: {
    shadowColor: "#000000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
};

export const CATEGORIES = [
  "Kapper",
  "Nagels",
  "Wimpers",
  "Wenkbrauwen",
  "Make-up",
  "Huid",
  "Massage",
  "Beauty",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DISCOVER_CATEGORY_FILTERS = ["Alles", ...CATEGORIES] as const;

export const CITY_OPTIONS = ["Alle", "Amsterdam", "Rotterdam", "Den Haag", "Utrecht"] as const;
