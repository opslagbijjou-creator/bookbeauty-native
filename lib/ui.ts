export const COLORS = {
  bg: "#f4f7fb",
  card: "#ffffff",
  border: "#e4eaf2",
  text: "#172230",
  muted: "#66758a",
  placeholder: "#93a1b3",
  primary: "#0f4c81",
  primarySoft: "#e8f1fb",
  danger: "#c24164",
  success: "#1f8a5b",
  surface: "#eef3f9",
  accent: "#f2b6c8",
  accentSoft: "#fdeef3",
};

export const CATEGORIES = [
  "Kapper",
  "Nagels",
  "Wimpers",
  "Wenkbrauwen",
  "Make-up",
  "Massage",
  "Spa",
  "Barber",
  "Overig",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DISCOVER_CATEGORY_FILTERS = ["Alles", ...CATEGORIES] as const;

export const CITY_OPTIONS = ["Alle", "Amsterdam", "Rotterdam", "Den Haag", "Utrecht"] as const;
