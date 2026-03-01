import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
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

  const currentCitySlug = mode === "discover" ? firstValue(params.city) || citySlug : citySlug;
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

  const categoryItems = useMemo(() => ["Alles", ...MARKETPLACE_CATEGORIES.map((item) => item.label)], []);
  const activeCategoryLabel = useMemo(() => {
    const category = getCategoryBySlug(currentCategorySlug);
    return category?.label || "Alles";
  }, [currentCategorySlug]);

  const applyRoute = useCallback(
    (nextFilters: MarketplaceFilters, overrides?: { citySlug?: string; categorySlug?: string | null }) => {
      const nextCitySlug = overrides?.citySlug || currentCitySlug || DEFAULT_MARKETPLACE_CITY.slug;
      const nextCategorySlug =
        typeof overrides?.categorySlug !== "undefined" ? overrides.categorySlug : currentCategorySlug || undefined;
      const basePath =
        mode === "discover"
          ? (() => {
              const discoverParams = new URLSearchParams();
              if (nextCitySlug && nextCitySlug !== DEFAULT_MARKETPLACE_CITY.slug) {
                discoverParams.set("city", nextCitySlug);
              }
              if (nextCategorySlug) {
                discoverParams.set("category", nextCategorySlug);
              }
              const raw = discoverParams.toString();
              return raw ? `/discover?${raw}` : "/discover";
            })()
          : getSalonListingPath(nextCitySlug, nextCategorySlug);
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

  function onChangeCity(nextCity: string) {
    applyRoute(filters, { citySlug: nextCity });
  }

  const cityLabels = MARKETPLACE_CITIES.map((item) => item.label);
  const activeCityLabel =
    MARKETPLACE_CITIES.find((item) => item.slug === currentCitySlug)?.label || DEFAULT_MARKETPLACE_CITY.label;

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTextWrap}>
          <Text style={styles.kicker}>BookBeauty Marketplace</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={COLORS.muted} />
          <TextInput
            value={draftQuery}
            onChangeText={setDraftQuery}
            placeholder="Zoek op salon, stad of categorie"
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
          />
          <Pressable onPress={() => setFilterOpen(true)} style={styles.filterBtn}>
            <Ionicons name="options-outline" size={16} color={COLORS.primary} />
            <Text style={styles.filterBtnText}>Filters</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.toolbarGroup}>
          <Text style={styles.toolbarLabel}>Stad</Text>
          <CategoryChips
            items={cityLabels}
            active={activeCityLabel}
            onChange={(label) => {
              const next = MARKETPLACE_CITIES.find((item) => item.label === label);
              if (next) onChangeCity(next.slug);
            }}
          />
        </View>

        <View style={styles.toolbarGroup}>
          <Text style={styles.toolbarLabel}>Categorie</Text>
          <CategoryChips items={categoryItems} active={activeCategoryLabel} onChange={onChangeCategory} />
        </View>
      </View>

      {usedFallback ? (
        <View style={styles.fallbackBanner}>
          <Ionicons name="sparkles-outline" size={16} color={COLORS.primary} />
          <Text style={styles.fallbackText}>
            Live aanbod is nog in opbouw. Daarom tonen we nu demo salons zodat de marketplace nooit leeg is.
          </Text>
        </View>
      ) : null}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>{loading ? "Salons laden" : `${items.length} salons gevonden`}</Text>
        <Text style={styles.resultsMeta}>
          {filters.priceMax ? `Tot ${formatCurrency(filters.priceMax)} • ` : ""}
          {filters.openNow ? "Nu open • " : ""}
          Sorteer op {filters.sort || DEFAULT_MARKETPLACE_SORT}
        </Text>
      </View>

      {loading ? (
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={styles.skeletonCard}>
              <SkeletonBlock height={220} />
              <SkeletonBlock height={24} width="72%" radius={10} />
              <SkeletonBlock height={18} width="48%" radius={10} />
              <SkeletonBlock height={18} width="88%" radius={10} />
              <SkeletonBlock height={18} width="64%" radius={10} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.slug} style={styles.gridItem}>
              <MarketplaceSalonCard
                salon={item}
                onPress={() => router.push(`/salon/${item.slug}` as never)}
              />
            </View>
          ))}
        </View>
      )}

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
              <Text style={styles.modalLabel}>Zoek op filtertag</Text>
              <TextInput
                value={filters.filter || ""}
                onChangeText={(value) => applyRoute({ ...filters, filter: value || undefined })}
                placeholder="biab, gel, brows"
                placeholderTextColor={COLORS.muted}
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
                placeholderTextColor={COLORS.muted}
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
                placeholderTextColor={COLORS.muted}
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
                  const active = (filters.sort || DEFAULT_MARKETPLACE_SORT) === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => applyRoute({ ...filters, sort: option.value })}
                      style={[styles.sortChip, active && styles.sortChipActive]}
                    >
                      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
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
              style={styles.resetBtn}
            >
              <Text style={styles.resetBtnText}>Reset filters</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    gap: 18,
    shadowColor: "#102544",
    shadowOpacity: 0.05,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  heroTextWrap: {
    gap: 8,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 760,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  toolbar: {
    marginTop: 18,
    gap: 14,
  },
  toolbarGroup: {
    gap: 8,
  },
  toolbarLabel: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  fallbackBanner: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  fallbackText: {
    flex: 1,
    color: COLORS.primary,
    fontWeight: "700",
    lineHeight: 20,
  },
  resultsHeader: {
    marginTop: 18,
    gap: 4,
  },
  resultsTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 22,
  },
  resultsMeta: {
    color: COLORS.muted,
    fontWeight: "600",
  },
  grid: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  gridItem: {
    flexBasis: 340,
    flexGrow: 1,
    flexShrink: 1,
  },
  skeletonCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: COLORS.card,
    padding: 16,
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12,20,31,0.42)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 24,
    backgroundColor: COLORS.card,
    padding: 20,
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
    fontSize: 22,
    fontWeight: "800",
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalField: {
    gap: 8,
  },
  modalLabel: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  modalInput: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontWeight: "600",
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
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortChipActive: {
    backgroundColor: COLORS.primary,
  },
  sortChipText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
  },
  sortChipTextActive: {
    color: "#ffffff",
  },
  resetBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
  },
});
