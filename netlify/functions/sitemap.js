const { getFirestore } = require("./_firebaseAdmin");

const BASE_URL = "https://www.bookbeauty.nl";
const CITIES = ["amsterdam", "rotterdam", "den-haag", "utrecht"];
const CATEGORIES = [
  "kapper",
  "nagelstudio",
  "wimpers",
  "wenkbrauwen",
  "make-up",
  "massage",
  "spa",
  "barber",
  "beauty",
];
const DEMO_SLUGS = [
  "lash-house-rotterdam-123",
  "studio-biabhub-rotterdam-211",
  "soft-glow-amsterdam-442",
  "house-of-fade-den-haag-889",
];

function normalizePlain(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugifySegment(value) {
  return normalizePlain(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function mapCity(value) {
  const clean = slugifySegment(value);
  return CITIES.includes(clean) ? clean : "rotterdam";
}

function mapCategory(value) {
  const clean = normalizePlain(value);
  if (clean.includes("nagel")) return "nagelstudio";
  if (clean.includes("wimper")) return "wimpers";
  if (clean.includes("wenk")) return "wenkbrauwen";
  if (clean.includes("make")) return "make-up";
  if (clean.includes("massage")) return "massage";
  if (clean.includes("spa")) return "spa";
  if (clean.includes("barber") || clean.includes("barbier")) return "barber";
  if (clean.includes("kapper") || clean.includes("haar")) return "kapper";
  return "beauty";
}

function buildSalonSlug(name, city, id) {
  const suffix = (slugifySegment(id) || "bbty").slice(0, 4);
  return [slugifySegment(name), slugifySegment(city), suffix].filter(Boolean).join("-");
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchSalonPaths() {
  try {
    const db = getFirestore();
    const snap = await db.collection("companies_public").where("isActive", "==", true).get();
    const rows = snap.docs.map((doc) => {
      const data = doc.data() || {};
      const name = String(data.name || "Salon");
      const city = mapCity(data.city);
      const slug = buildSalonSlug(name, city, doc.id);
      return `/salon/${slug}`;
    });
    const unique = Array.from(new Set(rows.filter(Boolean)));
    return unique.length ? unique : DEMO_SLUGS.map((slug) => `/salon/${slug}`);
  } catch {
    return DEMO_SLUGS.map((slug) => `/salon/${slug}`);
  }
}

exports.handler = async function handler() {
  const salonPaths = await fetchSalonPaths();
  const now = new Date().toISOString();
  const paths = new Set(["/", "/discover", "/feed"]);

  CITIES.forEach((city) => {
    paths.add(`/salons/${city}`);
    CATEGORIES.forEach((category) => {
      paths.add(`/salons/${city}/${category}`);
    });
  });

  salonPaths.forEach((path) => paths.add(path));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(paths)
  .map(
    (path) => `  <url>
    <loc>${xmlEscape(`${BASE_URL}${path}`)}</loc>
    <lastmod>${now}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
    body,
  };
};

