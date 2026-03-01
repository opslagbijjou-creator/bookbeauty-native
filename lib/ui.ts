export const COLORS = {
  bg: "#f6f4ef",
  card: "#ffffff",
  border: "#e8e1d7",
  text: "#1b2330",
  muted: "#6f7887",
  placeholder: "#98a0ae",
  primary: "#173b63",
  primarySoft: "#eef3fa",
  danger: "#c24164",
  success: "#1f8a5b",
  surface: "#efe9e0",
  accent: "#d88fa4",
  accentSoft: "#f9edf1",
};

export const CATEGORIES = [
  "Kapper",
  "Nagels",
  "Wimpers",
  "Wenkbrauwen",
  "Make-up",
  "Massage",
  "Spa",
  "Overig",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DISCOVER_CATEGORY_FILTERS = ["Alles", ...CATEGORIES] as const;

export const CITY_OPTIONS = ["Alle", "Amsterdam", "Rotterdam", "Den Haag", "Utrecht"] as const;
