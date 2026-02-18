export const COLORS = {
  bg: "#f8e8f0",
  card: "#ffffff",
  border: "#eed7e3",
  text: "#1f1f1f",
  muted: "#6e6a6c",
  placeholder: "#111111",
  primary: "#df4f9a",
  primarySoft: "#fce6f2",
  danger: "#c63957",
  success: "#4f9f66",
  surface: "#f7f1f4",
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
