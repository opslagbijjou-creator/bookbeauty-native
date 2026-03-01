import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import CategoryChips from "./CategoryChips";
import MarketplaceSalonCard from "./MarketplaceSalonCard";
import SkeletonBlock from "./SkeletonBlock";
import {
  DEFAULT_MARKETPLACE_CITY,
  DEFAULT_MARKETPLACE_SORT,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CITIES,
  MarketplaceFilters,
  MarketplaceSalon,
  fetchMarketplaceListing,
  formatCurrency,
  getCategoryBySlug,
  getSalonListingPath,
  normalizeListingFilters,
} from "../lib/marketplace";
import { COLORS } from "../lib/ui";

const DISCOVER_ALL_CITIES_SLUG = "all";

let pendingListingRestoreY = 0;
let shouldRestoreListingScroll = false;

type MarketplaceListingScreenProps = {
  mode: "discover" | "listing";
  citySlug: string;
  categorySlug?: string | null;
  title: string;
  subtitle: string;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function buildQueryString(filters: MarketplaceFilters): string {
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("query", filters.query.trim());
  if (filters.filter?.trim()) params.set("filter", filters.filter.trim());
  if (typeof filters.priceMax === "number" && Number.isFinite(filters.priceMax)) {
    params.set("priceMax", String(Math.max(0, Math.floor(filters.priceMax))));
  }
  if (typeof filters.ratingMin === "number" && Number.isFinite(filters.ratingMin)) {
    params.set("ratingMin", String(filters.ratingMin));
  }
  if (filters.openNow) params.set("openNow", "1");
  if (filters.sort && filters.sort !== DEFAULT_MARKETPLACE_SORT) params.set("sort", filters.sort);
  const output = params.toString();
  return output ? `?${output}` : "";
}

export default function MarketplaceListingScreen({
  mode,
  citySlug,
  categorySlug,
  title,
  subtitle,
}: MarketplaceListingScreenProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    query?: string | string[];
    filter?: string | string[];
    priceMax?: string | string[];
    ratingMin?: string | string[];
    openNow?: string | string[];
    sort?: string | string[];
    city?: string | string[];
    category?: string | string[];
  }>();

  const currentCitySlug =
    mode === "discover" ? firstValue(params.city) || citySlug || DISCOVER_ALL_CITIES_SLUG : citySlug;
  const currentCategorySlug =
    mode === "discover" ? firstValue(params.category) || categorySlug || "" : categorySlug || "";
  const filters = useMemo(
    () =>
      normalizeListingFilters({
        query: firstValue(params.query),
        filter: firstValue(params.filter),
        priceMax: firstValue(params.priceMax),
        ratingMin: firstValue(params.ratingMin),
        openNow: firstValue(params.openNow),
        sort: firstValue(params.sort),
      }),
    [params.filter, params.openNow, params.priceMax, params.query, params.ratingMin, params.sort]
  );

  const [draftQuery, setDraftQuery] = useState(filters.query || "");
  const [items, setItems] = useState<MarketplaceSalon[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);

  const categoryItems = useMemo(() => ["Alles", ...MARKETPLACE_CATEGORIES.map((item) => item.label)], []);
  const cityLabels = useMemo(
    () =>
      mode === "discover"
        ? ["Alle steden", ...MARKETPLACE_CITIES.map((item) => item.label)]
        : MARKETPLACE_CITIES.map((item) => item.label),
    [mode]
  );
  const activeCategoryLabel = useMemo(() => {
    const category = getCategoryBySlug(currentCategorySlug);
    return category?.label || "Alles";
  }, [currentCategorySlug]);
  const activeCityLabel =
    mode === "discover" && currentCitySlug === DISCOVER_ALL_CITIES_SLUG
      ? "Alle steden"
      : MARKETPLACE_CITIES.find((item) => item.slug === currentCitySlug)?.label || DEFAULT_MARKETPLACE_CITY.label;
  const showFloatingFilter = width < 900;

  useEffect(() => {
    setDraftQuery(filters.query || "");
  }, [filters.query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceListing({
      citySlug: currentCitySlug,
      categorySlug: currentCategorySlug,
      filters,
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setUsedFallback(result.usedFallback);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setUsedFallback(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentCategorySlug, currentCitySlug, filters]);

  useEffect(() => {
    if (loading || !shouldRestoreListingScroll) return;
    const targetY = pendingListingRestoreY;
    const raf = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
      shouldRestoreListingScroll = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [currentCategorySlug, currentCitySlug, items.length, loading]);

  const applyRoute = useCallback(
    (nextFilters: MarketplaceFilters, overrides?: { citySlug?: string; categorySlug?: string | null }) => {
      const nextCitySlug = overrides?.citySlug || currentCitySlug || DEFAULT_MARKETPLACE_CITY.slug;
      const nextCategorySlug =
        typeof overrides?.categorySlug !== "undefined" ? overrides.categorySlug : currentCategorySlug || undefined;
      const basePath =
        mode === "discover"
          ? (() => {
              const discoverParams = new URLSearchParams();
              if (nextCitySlug && nextCitySlug !== DISCOVER_ALL_CITIES_SLUG) {
                discoverParams.set("city", nextCitySlug);
              }
              if (nextCategorySlug) {
                discoverParams.set("category", nextCategorySlug);
              }
              const raw = discoverParams.toString();
              return raw ? `/discover?${raw}` : "/discover";
            })()
          : getSalonListingPath(nextCitySlug, nextCategorySlug);
      pendingListingRestoreY = scrollYRef.current;
      shouldRestoreListingScroll = true;

      const filterQuery = buildQueryString(nextFilters);
      if (!filterQuery) {
        router.replace(basePath as never);
        return;
      }
      router.replace(
        (basePath.includes("?") ? `${basePath}&${filterQuery.slice(1)}` : `${basePath}${filterQuery}`) as never
      );
    },
    [currentCategorySlug, currentCitySlug, mode, router]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      if ((filters.query || "") === draftQuery.trim()) return;
      applyRoute({ ...filters, query: draftQuery.trim() || undefined });
    }, 260);

    return () => clearTimeout(timeout);
  }, [applyRoute, draftQuery, filters]);

  function onChangeCategory(label: string) {
    const nextCategory = label === "Alles" ? undefined : MARKETPLACE_CATEGORIES.find((item) => item.label === label);
    applyRoute(filters, { categorySlug: nextCategory?.slug });
  }

  function onChangeCity(label: string) {
    if (mode === "discover" && label === "Alle steden") {
      applyRoute(filters, { citySlug: DISCOVER_ALL_CITIES_SLUG });
      return;
    }
    const next = MARKETPLACE_CITIES.find((item) => item.label === label);
    if (!next) return;
    applyRoute(filters, { citySlug: next.slug });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
      >
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageSubtitle}>{subtitle}</Text>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.muted} />
          <TextInput
            value={draftQuery}
            onChangeText={setDraftQuery}
            placeholder="Zoek op salon, stad of behandeling"
            placeholderTextColor={COLORS.placeholder}
            style={styles.searchInput}
          />
          {!showFloatingFilter ? (
            <Pressable onPress={() => setFilterOpen(true)} style={styles.inlineFilterButton}>
              <Ionicons name="options-outline" size={16} color={COLORS.text} />
              <Text style={styles.inlineFilterText}>Filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.toolbarBlock}>
          <Text style={styles.toolbarLabel}>Stad</Text>
          <CategoryChips items={cityLabels} active={activeCityLabel} onChange={onChangeCity} />
        </View>

        <View style={styles.toolbarBlock}>
          <Text style={styles.toolbarLabel}>Categorie</Text>
          <CategoryChips items={categoryItems} active={activeCategoryLabel} onChange={onChangeCategory} />
        </View>

        {usedFallback ? (
          <Text style={styles.fallbackNote}>
            Tijdelijk tonen we demo salons zodat de marketplace niet leeg aanvoelt.
          </Text>
        ) : null}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>{loading ? "Salons laden" : `${items.length} salons`}</Text>
          <Text style={styles.resultsMeta}>
            {filters.priceMax ? `Tot ${formatCurrency(filters.priceMax)} • ` : ""}
            {filters.openNow ? "Nu open • " : ""}
            {filters.sort || DEFAULT_MARKETPLACE_SORT}
          </Text>
        </View>

        <View style={styles.listShell}>
          {loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <View key={index} style={styles.skeletonRow}>
                  <SkeletonBlock height={118} width={118} radius={0} />
                  <View style={styles.skeletonBody}>
                    <SkeletonBlock height={20} width="72%" radius={6} />
                    <SkeletonBlock height={16} width="46%" radius={6} />
                    <SkeletonBlock height={16} width="92%" radius={6} />
                    <SkeletonBlock height={16} width="66%" radius={6} />
                  </View>
                </View>
              ))
            : items.map((item) => (
                <MarketplaceSalonCard
                  key={item.slug}
                  salon={item}
                  onPress={() => router.push(`/salon/${item.slug}` as never)}
                />
              ))}
        </View>
      </ScrollView>

      {showFloatingFilter ? (
        <Pressable onPress={() => setFilterOpen(true)} style={({ pressed }) => [styles.floatingFilter, pressed && styles.floatingFilterPressed]}>
          <Ionicons name="options-outline" size={18} color="#ffffff" />
          <Text style={styles.floatingFilterText}>Filters</Text>
        </Pressable>
      ) : null}

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <Pressable onPress={() => setFilterOpen(false)} style={styles.modalClose}>
                <Ionicons name="close" size={16} color={COLORS.text} />
              </Pressable>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Specialisatie</Text>
              <TextInput
                value={filters.filter || ""}
                onChangeText={(value) => applyRoute({ ...filters, filter: value || undefined })}
                placeholder="biab, gel, brows"
                placeholderTextColor={COLORS.placeholder}
                style={styles.modalInput}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Max prijs</Text>
              <TextInput
                value={typeof filters.priceMax === "number" ? String(filters.priceMax) : ""}
                onChangeText={(value) =>
                  applyRoute({
                    ...filters,
                    priceMax: value.trim() ? Number(value) : undefined,
                  })
                }
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor={COLORS.placeholder}
                style={styles.modalInput}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Min rating</Text>
              <TextInput
                value={typeof filters.ratingMin === "number" ? String(filters.ratingMin) : ""}
                onChangeText={(value) =>
                  applyRoute({
                    ...filters,
                    ratingMin: value.trim() ? Number(value) : undefined,
                  })
                }
                keyboardType="decimal-pad"
                placeholder="4"
                placeholderTextColor={COLORS.placeholder}
                style={styles.modalInput}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.modalLabel}>Alleen nu open</Text>
              <Switch
                value={Boolean(filters.openNow)}
                onValueChange={(value) => applyRoute({ ...filters, openNow: value || undefined })}
                trackColor={{ false: COLORS.surface, true: COLORS.primarySoft }}
                thumbColor={filters.openNow ? COLORS.primary : "#ffffff"}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Sortering</Text>
              <View style={styles.sortRow}>
                {[
                  { label: "Popular", value: "popular" },
                  { label: "Prijs", value: "price_asc" },
                  { label: "Rating", value: "rating" },
                ].map((option) => {
                  const activeSort = (filters.sort || DEFAULT_MARKETPLACE_SORT) === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => applyRoute({ ...filters, sort: option.value })}
                      style={[styles.sortChip, activeSort && styles.sortChipActive]}
                    >
                      <Text style={[styles.sortChipText, activeSort && styles.sortChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={() => {
                setFilterOpen(false);
                applyRoute({ sort: DEFAULT_MARKETPLACE_SORT });
              }}
              style={styles.resetButton}
            >
              <Text style={styles.resetButtonText}>Reset filters</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: 118,
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "900",
    letterSpacing: -1,
  },
  pageSubtitle: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 760,
  },
  searchBar: {
    marginTop: 24,
    minHeight: 64,
    borderWidth: 1,
    borderColor: "rgba(232,225,215,0.92)",
    borderRadius: 22,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    shadowColor: "#182330",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  inlineFilterButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineFilterText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  toolbarBlock: {
    marginTop: 22,
    gap: 10,
  },
  toolbarLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fallbackNote: {
    marginTop: 18,
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  resultsHeader: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  resultsTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  resultsMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  listShell: {
    marginTop: 16,
    gap: 16,
  },
  skeletonRow: {
    flexDirection: "row",
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 14,
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  skeletonBody: {
    flex: 1,
    justifyContent: "space-between",
    minHeight: 118,
  },
  floatingFilter: {
    position: "absolute",
    right: 8,
    bottom: 10,
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#172330",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  floatingFilterPressed: {
    transform: [{ scale: 0.98 }],
  },
  floatingFilterText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12,20,31,0.42)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
  },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  modalField: {
    gap: 8,
  },
  modalLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  modalInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sortChip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  sortChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  sortChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  sortChipTextActive: {
    color: "#ffffff",
  },
  resetButton: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  resetButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
});
