import { CompanyPublic, fetchCompanies } from "./companyRepo";
import { FeedPost, fetchCompanyFeedPublic, fetchFeed } from "./feedRepo";
import { CompanyService, fetchCompanyServicesPublic } from "./serviceRepo";

export type MarketplaceCity = {
  label: string;
  slug: string;
};

export type MarketplaceCategory = {
  label: string;
  slug: string;
  aliases: string[];
};

export type MarketplaceService = {
  id: string;
  name: string;
  categoryLabel: string;
  categorySlug: string;
  description: string;
  price: number;
  durationMin: number;
};

export type MarketplaceFeedItem = {
  id: string;
  title: string;
  caption: string;
  categoryLabel: string;
  categorySlug: string;
  mediaType: "image" | "video";
  posterUrl: string;
  videoUrl?: string;
  imageUrl?: string;
  companyId?: string;
  companyName: string;
  companySlug: string;
  companyLogoUrl?: string;
  isDemo?: boolean;
};

export type MarketplaceSalon = {
  id: string;
  sourceCompanyId?: string;
  slug: string;
  name: string;
  city: string;
  citySlug: string;
  categoryLabel: string;
  categorySlug: string;
  categoryTags: string[];
  minPrice: number;
  rating: number;
  reviewCount: number;
  coverImageUrl: string;
  logoUrl?: string;
  bio: string;
  badge?: string;
  openNow: boolean;
  tags: string[];
  services: MarketplaceService[];
  feed: MarketplaceFeedItem[];
  isDemo?: boolean;
};

export type MarketplaceFilters = {
  query?: string;
  filter?: string;
  priceMax?: number;
  ratingMin?: number;
  openNow?: boolean;
  sort?: string;
};

const MARKETPLACE_BASE_URL = String(process.env.EXPO_PUBLIC_APP_BASE_URL || "https://www.bookbeauty.nl")
  .trim()
  .replace(/\/+$/, "");

export const MARKETPLACE_CITIES: MarketplaceCity[] = [
  { label: "Amsterdam", slug: "amsterdam" },
  { label: "Rotterdam", slug: "rotterdam" },
  { label: "Den Haag", slug: "den-haag" },
  { label: "Utrecht", slug: "utrecht" },
];

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  { label: "Kapper", slug: "kapper", aliases: ["kapper", "haar", "hair"] },
  { label: "Nagelstudio", slug: "nagelstudio", aliases: ["nagels", "nagelstudio", "nails"] },
  { label: "Wimpers", slug: "wimpers", aliases: ["wimpers", "lashes"] },
  { label: "Wenkbrauwen", slug: "wenkbrauwen", aliases: ["wenkbrauwen", "brows"] },
  { label: "Make-up", slug: "make-up", aliases: ["make-up", "makeup", "visagie"] },
  { label: "Massage", slug: "massage", aliases: ["massage"] },
  { label: "Spa", slug: "spa", aliases: ["spa", "wellness"] },
  { label: "Beauty", slug: "beauty", aliases: ["beauty", "overig"] },
];

export const DEFAULT_MARKETPLACE_CITY = MARKETPLACE_CITIES[1];
export const DEFAULT_MARKETPLACE_SORT = "popular";

function normalizePlain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function slugifySegment(value: string): string {
  return normalizePlain(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getCategoryBySlug(slug?: string | null): MarketplaceCategory | null {
  const clean = slugifySegment(String(slug || ""));
  if (!clean) return null;
  return MARKETPLACE_CATEGORIES.find((item) => item.slug === clean) ?? null;
}

export function getCategoryFromLabel(value?: string | null): MarketplaceCategory {
  const clean = normalizePlain(String(value || ""));
  const match =
    MARKETPLACE_CATEGORIES.find((item) => item.aliases.some((alias) => clean.includes(alias))) ??
    MARKETPLACE_CATEGORIES[MARKETPLACE_CATEGORIES.length - 1];
  return match;
}

export function getCityBySlug(slug?: string | null): MarketplaceCity | null {
  const clean = slugifySegment(String(slug || ""));
  if (!clean) return null;
  return MARKETPLACE_CITIES.find((item) => item.slug === clean) ?? null;
}

export function getCityFromLabel(value?: string | null): MarketplaceCity {
  const label = String(value || "").trim();
  const clean = slugifySegment(label);
  const knownCity = MARKETPLACE_CITIES.find((item) => item.slug === clean);
  if (knownCity) return knownCity;
  if (clean) {
    return {
      label,
      slug: clean,
    };
  }
  return DEFAULT_MARKETPLACE_CITY;
}

function makePosterUrl(seed: string): string {
  const id = encodeURIComponent(seed);
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
}

function buildSalonSlug(name: string, city: string, id: string): string {
  const suffix = slugifySegment(id).slice(0, 4) || "bbty";
  return [slugifySegment(name), slugifySegment(city), suffix].filter(Boolean).join("-");
}

function mapServiceToMarketplaceService(service: CompanyService): MarketplaceService {
  const category = getCategoryFromLabel(service.category);
  return {
    id: service.id,
    name: service.name,
    categoryLabel: category.label,
    categorySlug: category.slug,
    description:
      service.description?.trim() ||
      `${service.name} met een duidelijke intake, strakke uitvoering en een rustige boekervaring.`,
    price: Math.max(0, Number(service.price || 0)),
    durationMin: Math.max(15, Number(service.durationMin || 30)),
  };
}

function cloudinaryVideoThumbnailFromUrl(videoUrl?: string): string {
  if (!videoUrl) return "";
  const [rawPath, rawQuery = ""] = videoUrl.split("?");
  let path = rawPath;

  if (path.includes("/upload/")) {
    path = path.replace("/upload/", "/upload/so_1,c_fill,g_auto,ar_4:5,w_900,h_1125,q_auto,f_jpg/");
  }

  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(path)) {
    path = path.replace(/\.(mp4|mov|m4v|webm|avi)$/i, ".jpg");
  } else if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) {
    path = `${path}.jpg`;
  }

  return rawQuery ? `${path}?${rawQuery}` : path;
}

function mapFeedPostToMarketplaceItem(post: FeedPost, companySlug: string): MarketplaceFeedItem {
  const category = getCategoryFromLabel(post.category);
  const posterUrl =
    post.thumbnailUrl?.trim() ||
    post.imageUrl?.trim() ||
    cloudinaryVideoThumbnailFromUrl(post.videoUrl) ||
    makePosterUrl("photo-1521590832167-7bcbfaa6381f");

  return {
    id: post.id,
    title: post.title?.trim() || post.serviceName?.trim() || `${category.label} moment`,
    caption:
      post.caption?.trim() ||
      "Video laat direct zien hoe een salon werkt, voelt en resultaat levert.",
    categoryLabel: category.label,
    categorySlug: category.slug,
    mediaType: post.mediaType,
    posterUrl,
    videoUrl: post.videoUrl?.trim() || undefined,
    imageUrl: post.imageUrl?.trim() || undefined,
    companyId: post.companyId,
    companyName: post.companyName,
    companySlug,
    companyLogoUrl: post.companyLogoUrl?.trim() || undefined,
  };
}

function mapCompanyToMarketplaceSalon(company: CompanyPublic): MarketplaceSalon {
  const city = getCityFromLabel(company.city);
  const leadCategory = getCategoryFromLabel(company.categories[0] || "");
  const slug = buildSalonSlug(company.name, city.label, company.id);
  const rating = Math.max(4.1, Number(company.ratingAvg || 0) || 4.6);
  const reviewCount = Math.max(6, Number(company.ratingCount || 0) || 18);
  const tags = [leadCategory.label, ...(company.categories || [])]
    .map((item) => getCategoryFromLabel(item).label)
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .slice(0, 3);

  return {
    id: company.id,
    sourceCompanyId: company.id,
    slug,
    name: company.name,
    city: city.label,
    citySlug: city.slug,
    categoryLabel: leadCategory.label,
    categorySlug: leadCategory.slug,
    categoryTags: tags,
    minPrice: Math.max(0, Number(company.minPrice || 0)),
    rating,
    reviewCount,
    coverImageUrl:
      company.coverImageUrl?.trim() ||
      makePosterUrl("photo-1522337360788-8b13dee7a37e"),
    logoUrl: company.logoUrl?.trim() || undefined,
    bio:
      company.bio?.trim() ||
      `${company.name} in ${city.label} levert rustige beauty-afspraken met duidelijke prijzen en snelle bevestiging.`,
    badge: company.badge,
    openNow: true,
    tags,
    services: [],
    feed: [],
  };
}

function buildDemoSalons(): MarketplaceSalon[] {
  const rows: MarketplaceSalon[] = [
    {
      id: "demo-rotterdam-lash-house",
      slug: "lash-house-rotterdam-123",
      name: "Lash House",
      city: "Rotterdam",
      citySlug: "rotterdam",
      categoryLabel: "Wimpers",
      categorySlug: "wimpers",
      categoryTags: ["Wimpers", "Wenkbrauwen"],
      minPrice: 39,
      rating: 4.9,
      reviewCount: 84,
      coverImageUrl: makePosterUrl("photo-1487412720507-e7ab37603c6f"),
      bio: "Premium lash studio met natuurlijke sets, BIAB add-ons en een snelle aanvraagflow.",
      badge: "Top rated",
      openNow: true,
      tags: ["Wimpers", "Wenkbrauwen", "BIAB"],
      services: [
        {
          id: "demo-lash-1",
          name: "Classic set",
          categoryLabel: "Wimpers",
          categorySlug: "wimpers",
          description: "Natuurlijke set met intake en afwerking.",
          price: 59,
          durationMin: 60,
        },
        {
          id: "demo-lash-2",
          name: "Brow shape + tint",
          categoryLabel: "Wenkbrauwen",
          categorySlug: "wenkbrauwen",
          description: "Strakke brows met zachte finish.",
          price: 39,
          durationMin: 40,
        },
      ],
      feed: [],
      isDemo: true,
    },
    {
      id: "demo-rotterdam-biabhub",
      slug: "studio-biabhub-rotterdam-211",
      name: "Studio BIABHub",
      city: "Rotterdam",
      citySlug: "rotterdam",
      categoryLabel: "Nagelstudio",
      categorySlug: "nagelstudio",
      categoryTags: ["Nagelstudio"],
      minPrice: 32,
      rating: 4.8,
      reviewCount: 57,
      coverImageUrl: makePosterUrl("photo-1604654894610-df63bc536371"),
      bio: "Strakke BIAB, gel en nabehandeling met rustige studio-afspraken.",
      openNow: true,
      tags: ["BIAB", "Gel", "Nagelstudio"],
      services: [
        {
          id: "demo-nails-1",
          name: "BIAB natural overlay",
          categoryLabel: "Nagelstudio",
          categorySlug: "nagelstudio",
          description: "Verstevigende BIAB set met nette prep.",
          price: 49,
          durationMin: 70,
        },
        {
          id: "demo-nails-2",
          name: "Gel polish refresh",
          categoryLabel: "Nagelstudio",
          categorySlug: "nagelstudio",
          description: "Snelle refresh voor glans en houdbaarheid.",
          price: 32,
          durationMin: 40,
        },
      ],
      feed: [],
      isDemo: true,
    },
    {
      id: "demo-amsterdam-softglow",
      slug: "soft-glow-amsterdam-442",
      name: "Soft Glow Studio",
      city: "Amsterdam",
      citySlug: "amsterdam",
      categoryLabel: "Make-up",
      categorySlug: "make-up",
      categoryTags: ["Make-up", "Wenkbrauwen"],
      minPrice: 45,
      rating: 4.7,
      reviewCount: 36,
      coverImageUrl: makePosterUrl("photo-1524504388940-b1c1722653e1"),
      bio: "Editorial make-up en brows voor events, creators en snelle touch-ups.",
      openNow: false,
      tags: ["Make-up", "Brows"],
      services: [
        {
          id: "demo-makeup-1",
          name: "Soft glam",
          categoryLabel: "Make-up",
          categorySlug: "make-up",
          description: "Clean glam met huidfocus en zachte finish.",
          price: 75,
          durationMin: 60,
        },
      ],
      feed: [],
      isDemo: true,
    },
    {
      id: "demo-denhaag-skinatelier",
      slug: "skin-atelier-den-haag-889",
      name: "Skin Atelier",
      city: "Den Haag",
      citySlug: "den-haag",
      categoryLabel: "Beauty",
      categorySlug: "beauty",
      categoryTags: ["Beauty", "Spa"],
      minPrice: 52,
      rating: 4.8,
      reviewCount: 42,
      coverImageUrl: makePosterUrl("photo-1522335789203-aabd1fc54bc9"),
      bio: "Rustige skin studio voor glow facials, huidboosters en zachte self-care afspraken.",
      openNow: true,
      tags: ["Beauty", "Facial", "Glow"],
      services: [
        {
          id: "demo-skin-1",
          name: "Hydra glow facial",
          categoryLabel: "Beauty",
          categorySlug: "beauty",
          description: "Diepe reiniging, hydratie en een directe frisse glow.",
          price: 64,
          durationMin: 55,
        },
      ],
      feed: [],
      isDemo: true,
    },
  ];

  rows.forEach((salon) => {
    salon.feed = [
      {
        id: `${salon.id}-feed-1`,
        title: `${salon.name} in 30 seconden`,
        caption: "Bekijk de studio, de sfeer en wat klanten als eerste zien.",
        categoryLabel: salon.categoryLabel,
        categorySlug: salon.categorySlug,
        mediaType: "video",
        posterUrl: salon.coverImageUrl,
        imageUrl: salon.coverImageUrl,
        companyId: salon.id,
        companyName: salon.name,
        companySlug: salon.slug,
        isDemo: true,
      },
    ];
  });

  return rows;
}

export const DEMO_MARKETPLACE_SALONS = buildDemoSalons();

export const DEMO_MARKETPLACE_FEED: MarketplaceFeedItem[] = [
  {
    id: "feed-bookbeauty-1",
    title: "Wat is BookBeauty",
    caption: "BookBeauty maakt beauty discovery visueel, lokaal en direct boekbaar.",
    categoryLabel: "Beauty",
    categorySlug: "beauty",
    mediaType: "video",
    posterUrl: DEMO_MARKETPLACE_SALONS[0].coverImageUrl,
    imageUrl: DEMO_MARKETPLACE_SALONS[0].coverImageUrl,
    companyId: DEMO_MARKETPLACE_SALONS[0].id,
    companyName: "BookBeauty",
    companySlug: DEMO_MARKETPLACE_SALONS[0].slug,
    isDemo: true,
  },
  {
    id: "feed-bookbeauty-2",
    title: "Waarom video discovery",
    caption: "Een video laat direct kwaliteit, stijl en sfeer zien voordat je boekt.",
    categoryLabel: "Beauty",
    categorySlug: "beauty",
    mediaType: "video",
    posterUrl: DEMO_MARKETPLACE_SALONS[1].coverImageUrl,
    imageUrl: DEMO_MARKETPLACE_SALONS[1].coverImageUrl,
    companyId: DEMO_MARKETPLACE_SALONS[1].id,
    companyName: "BookBeauty",
    companySlug: DEMO_MARKETPLACE_SALONS[1].slug,
    isDemo: true,
  },
  {
    id: "feed-bookbeauty-3",
    title: "Booking demo",
    caption: "Vraag een afspraak aan als gast met alleen je e-mail. Simpel en snel.",
    categoryLabel: "Beauty",
    categorySlug: "beauty",
    mediaType: "video",
    posterUrl: DEMO_MARKETPLACE_SALONS[2].coverImageUrl,
    imageUrl: DEMO_MARKETPLACE_SALONS[2].coverImageUrl,
    companyId: DEMO_MARKETPLACE_SALONS[2].id,
    companyName: "BookBeauty",
    companySlug: DEMO_MARKETPLACE_SALONS[2].slug,
    isDemo: true,
  },
  {
    id: "feed-bookbeauty-4",
    title: "Payments coming soon",
    caption: "Phase 1 focust op discovery en aanvragen. Betalen volgt later.",
    categoryLabel: "Beauty",
    categorySlug: "beauty",
    mediaType: "video",
    posterUrl: DEMO_MARKETPLACE_SALONS[3].coverImageUrl,
    imageUrl: DEMO_MARKETPLACE_SALONS[3].coverImageUrl,
    companyId: DEMO_MARKETPLACE_SALONS[3].id,
    companyName: "BookBeauty",
    companySlug: DEMO_MARKETPLACE_SALONS[3].slug,
    isDemo: true,
  },
  {
    id: "feed-bookbeauty-5",
    title: "Creator program coming",
    caption: "Creators krijgen straks eigen campagnes, tracking en studio-koppelingen.",
    categoryLabel: "Beauty",
    categorySlug: "beauty",
    mediaType: "video",
    posterUrl: DEMO_MARKETPLACE_SALONS[0].coverImageUrl,
    imageUrl: DEMO_MARKETPLACE_SALONS[0].coverImageUrl,
    companyId: DEMO_MARKETPLACE_SALONS[0].id,
    companyName: "BookBeauty",
    companySlug: DEMO_MARKETPLACE_SALONS[0].slug,
    isDemo: true,
  },
];

export function getSalonListingPath(citySlug: string, categorySlug?: string | null): string {
  const city = getCityBySlug(citySlug) ?? DEFAULT_MARKETPLACE_CITY;
  const category = getCategoryBySlug(categorySlug);
  return category ? `/salons/${city.slug}/${category.slug}` : `/salons/${city.slug}`;
}

export function getSalonProfilePath(slug: string): string {
  return `/salon/${slugifySegment(slug) || slug}`;
}

export function getDefaultCityPath(): string {
  return getSalonListingPath(DEFAULT_MARKETPLACE_CITY.slug);
}

export function buildCanonicalUrl(pathname: string): string {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${MARKETPLACE_BASE_URL}${cleanPath}`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

export function parseBooleanFilter(value: unknown): boolean {
  const clean = String(value ?? "").trim().toLowerCase();
  return clean === "1" || clean === "true" || clean === "yes";
}

export function parseNumberFilter(value: unknown): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return undefined;
  return raw;
}

export function normalizeListingFilters(input: Record<string, unknown>): MarketplaceFilters {
  return {
    query: String(input.query ?? "").trim(),
    filter: slugifySegment(String(input.filter ?? "")) || undefined,
    priceMax: parseNumberFilter(input.priceMax),
    ratingMin: parseNumberFilter(input.ratingMin),
    openNow: parseBooleanFilter(input.openNow),
    sort: String(input.sort ?? "").trim() || DEFAULT_MARKETPLACE_SORT,
  };
}

function matchesQuery(salon: MarketplaceSalon, query?: string): boolean {
  const clean = normalizePlain(String(query || ""));
  if (!clean) return true;
  return [salon.name, salon.city, salon.categoryLabel, salon.bio, salon.tags.join(" ")]
    .join(" ")
    .toLowerCase()
    .includes(clean);
}

function matchesFilterTag(salon: MarketplaceSalon, filter?: string): boolean {
  const clean = slugifySegment(String(filter || ""));
  if (!clean) return true;
  return salon.tags.some((item) => slugifySegment(item) === clean);
}

function sortSalons(items: MarketplaceSalon[], sort?: string): MarketplaceSalon[] {
  const mode = String(sort || DEFAULT_MARKETPLACE_SORT).trim().toLowerCase();
  const rows = [...items];

  if (mode === "price_asc") {
    return rows.sort((a, b) => a.minPrice - b.minPrice || b.rating - a.rating);
  }

  if (mode === "rating") {
    return rows.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  }

  if (mode === "new") {
    return rows.sort((a, b) => Number(Boolean(b.isDemo)) - Number(Boolean(a.isDemo)));
  }

  return rows.sort((a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount);
}

export function applyMarketplaceFilters(
  salons: MarketplaceSalon[],
  config: {
    citySlug?: string | null;
    categorySlug?: string | null;
    filters?: MarketplaceFilters;
  }
): MarketplaceSalon[] {
  const city = getCityBySlug(config.citySlug);
  const category = getCategoryBySlug(config.categorySlug);
  const filters = config.filters ?? {};

  const filtered = salons.filter((salon) => {
    if (city && salon.citySlug !== city.slug) return false;
    if (category && salon.categorySlug !== category.slug) return false;
    if (!matchesQuery(salon, filters.query)) return false;
    if (!matchesFilterTag(salon, filters.filter)) return false;
    if (typeof filters.priceMax === "number" && salon.minPrice > filters.priceMax) return false;
    if (typeof filters.ratingMin === "number" && salon.rating < filters.ratingMin) return false;
    if (filters.openNow && !salon.openNow) return false;
    return true;
  });

  return sortSalons(filtered, filters.sort);
}

async function fetchLiveMarketplaceSalons(): Promise<MarketplaceSalon[]> {
  const companies = await fetchCompanies({ take: 120 });
  return companies.map(mapCompanyToMarketplaceSalon);
}

export async function fetchMarketplaceListing(config: {
  citySlug?: string | null;
  categorySlug?: string | null;
  filters?: MarketplaceFilters;
}): Promise<{ items: MarketplaceSalon[]; usedFallback: boolean }> {
  try {
    const live = await fetchLiveMarketplaceSalons();
    const filteredLive = applyMarketplaceFilters(live, config);
    if (filteredLive.length > 0) {
      return { items: filteredLive, usedFallback: false };
    }

    const filteredDemo = applyMarketplaceFilters(DEMO_MARKETPLACE_SALONS, config);
    return {
      items: filteredDemo.length ? filteredDemo : DEMO_MARKETPLACE_SALONS,
      usedFallback: true,
    };
  } catch {
    const filteredDemo = applyMarketplaceFilters(DEMO_MARKETPLACE_SALONS, config);
    return {
      items: filteredDemo.length ? filteredDemo : DEMO_MARKETPLACE_SALONS,
      usedFallback: true,
    };
  }
}

async function hydrateLiveSalon(salon: MarketplaceSalon): Promise<MarketplaceSalon> {
  const companyId = salon.sourceCompanyId || salon.id;
  const [services, feed] = await Promise.all([
    fetchCompanyServicesPublic(companyId).catch(() => [] as CompanyService[]),
    fetchCompanyFeedPublic(companyId).catch(() => [] as FeedPost[]),
  ]);

  const mappedServices = services.map(mapServiceToMarketplaceService);
  const mappedFeed = feed.map((item) => mapFeedPostToMarketplaceItem(item, salon.slug));

  return {
    ...salon,
    services: mappedServices.length
      ? mappedServices
      : [
          {
            id: `${salon.id}-service-1`,
            name: `${salon.categoryLabel} afspraak`,
            categoryLabel: salon.categoryLabel,
            categorySlug: salon.categorySlug,
            description: "Snelle aanvraag met bevestiging door de salon.",
            price: Math.max(0, salon.minPrice),
            durationMin: 45,
          },
        ],
    feed: mappedFeed.length ? mappedFeed : salon.feed,
  };
}

export async function fetchMarketplaceSalonBySlug(slug: string): Promise<MarketplaceSalon | null> {
  const clean = slugifySegment(slug);
  const demo = DEMO_MARKETPLACE_SALONS.find((item) => item.slug === clean);

  try {
    const live = await fetchLiveMarketplaceSalons();
    const match = live.find((item) => item.slug === clean);
    if (match) {
      return hydrateLiveSalon(match);
    }
  } catch {
    // Fall back to demo content below.
  }

  return demo ?? null;
}

export async function fetchMarketplaceFeed(limitCount = 8): Promise<MarketplaceFeedItem[]> {
  try {
    const res = await fetchFeed({ pageSize: Math.max(1, limitCount) });
    const mapped = res.items.map((item) =>
      mapFeedPostToMarketplaceItem(
        item,
        item.companyId ? buildSalonSlug(item.companyName, item.companyCity || DEFAULT_MARKETPLACE_CITY.label, item.companyId) : ""
      )
    );
    return mapped.length ? mapped : DEMO_MARKETPLACE_FEED.slice(0, limitCount);
  } catch {
    return DEMO_MARKETPLACE_FEED.slice(0, limitCount);
  }
}

export function buildListingSeo(args: { citySlug?: string | null; categorySlug?: string | null }) {
  const city = getCityBySlug(args.citySlug) ?? DEFAULT_MARKETPLACE_CITY;
  const category = getCategoryBySlug(args.categorySlug);
  const pathname = getSalonListingPath(city.slug, category?.slug);
  const title = category
    ? `${category.label} in ${city.label} boeken | BookBeauty`
    : `Salons in ${city.label} ontdekken | BookBeauty`;
  const description = category
    ? `Bekijk ${category.label.toLowerCase()} in ${city.label}, vergelijk prijzen en vraag direct een afspraak aan.`
    : `Ontdek actieve salons in ${city.label}, vergelijk diensten en boek eenvoudig zonder login.`;

  return {
    title,
    description,
    pathname,
    canonical: buildCanonicalUrl(pathname),
  };
}

export function buildHomeSeo() {
  const pathname = "/";
  return {
    title: "BookBeauty | Ontdek salons. Bekijk echte video's. Boek direct.",
    description:
      "BookBeauty verbindt beauty professionals en klanten via video en een simpele boekervaring.",
    pathname,
    canonical: buildCanonicalUrl(pathname),
  };
}

export function buildFeedSeo() {
  const pathname = "/feed";
  return {
    title: "BookBeauty Feed | Video discovery voor beauty",
    description:
      "Scroll door beauty video's, ontdek salons en zie hoe BookBeauty discovery en boeken simpeler maakt.",
    pathname,
    canonical: buildCanonicalUrl(pathname),
  };
}

export function buildDiscoverSeo() {
  const pathname = "/discover";
  return {
    title: "Discover salons | BookBeauty",
    description: "Zoek salons op stad, categorie en filters. Zonder login.",
    pathname,
    canonical: buildCanonicalUrl(pathname),
  };
}

export function buildSalonSeo(salon: MarketplaceSalon) {
  const pathname = getSalonProfilePath(salon.slug);
  return {
    title: `${salon.name} in ${salon.city} | ${salon.categoryLabel} | BookBeauty`,
    description: `${salon.name} in ${salon.city}. Vanaf ${formatCurrency(
      salon.minPrice
    )}. Bekijk diensten, video's en vraag direct een afspraak aan.`,
    pathname,
    canonical: buildCanonicalUrl(pathname),
  };
}

export function buildLocalBusinessSchema(salon: MarketplaceSalon): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: salon.name,
    description: salon.bio,
    image: salon.coverImageUrl,
    url: buildCanonicalUrl(getSalonProfilePath(salon.slug)),
    priceRange: `${formatCurrency(salon.minPrice)}+`,
    address: {
      "@type": "PostalAddress",
      addressLocality: salon.city,
      addressCountry: "NL",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: salon.rating,
      reviewCount: salon.reviewCount,
    },
    makesOffer: salon.services.map((service) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: service.name,
      },
      price: service.price,
      priceCurrency: "EUR",
    })),
  });
}

export function getStaticCityCategoryPaths(): Array<{ city: string; category: string }> {
  const rows: Array<{ city: string; category: string }> = [];
  MARKETPLACE_CITIES.forEach((city) => {
    MARKETPLACE_CATEGORIES.forEach((category) => {
      rows.push({ city: city.slug, category: category.slug });
    });
  });
  return rows;
}
