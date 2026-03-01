import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import CategoryChips from "../components/CategoryChips";
import MarketplaceSalonCard from "../components/MarketplaceSalonCard";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import SkeletonBlock from "../components/SkeletonBlock";
import {
  DEFAULT_MARKETPLACE_CITY,
  DEMO_MARKETPLACE_SALONS,
  MARKETPLACE_CATEGORIES,
  MarketplaceSalon,
  buildHomeStructuredData,
  buildHomeSeo,
  fetchMarketplaceListing,
} from "../lib/marketplace";
import { COLORS } from "../lib/ui";

function buildDiscoverHref(query: string): string {
  const clean = query.trim();
  if (!clean) return "/discover";
  return `/discover?query=${encodeURIComponent(clean)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const popularColumns = width >= 1180 ? 3 : desktop ? 2 : 1;
  const [query, setQuery] = useState("");
  const [popularSalons, setPopularSalons] = useState<MarketplaceSalon[]>([]);
  const [loading, setLoading] = useState(true);
  const seo = buildHomeSeo();
  const homeStructuredData = useMemo(() => buildHomeStructuredData(popularSalons), [popularSalons]);
  const categoryLabels = useMemo(() => MARKETPLACE_CATEGORIES.slice(0, 6).map((item) => item.label), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceListing({
      filters: { sort: "popular" },
    })
      .then((result) => {
        if (cancelled) return;
        setPopularSalons(result.items.slice(0, 4));
      })
      .catch(() => {
        if (cancelled) return;
        setPopularSalons(DEMO_MARKETPLACE_SALONS.slice(0, 4));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MarketplaceShell active="home">
      <MarketplaceSeo
        title={seo.title}
        description={seo.description}
        pathname={seo.pathname}
        image={DEMO_MARKETPLACE_SALONS[0].coverImageUrl}
        structuredData={homeStructuredData}
      />

      <View style={[styles.heroShell, desktop && styles.heroShellDesktop]}>
        <View style={[styles.hero, desktop && styles.heroDesktop]}>
          <Text style={styles.eyebrow}>Beauty marketplace voor Nederland</Text>
          <Text style={[styles.title, desktop ? styles.titleDesktop : styles.titleMobile]}>
            Beauty salons in Nederland – direct online boeken
          </Text>
          <Text style={[styles.subtitle, !desktop && styles.subtitleMobile]}>
            Vind snel een salon die bij je past: reviews, prijzen en beschikbaarheid in één plek.
          </Text>

          {desktop ? (
            <View style={[styles.searchBar, styles.searchBarDesktop]}>
              <Ionicons name="search" size={20} color={COLORS.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Zoek op salon, behandeling of stad"
                placeholderTextColor={COLORS.placeholder}
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => router.push(buildDiscoverHref(query) as never)}
              />
              <Pressable
                onPress={() => router.push(buildDiscoverHref(query) as never)}
                style={({ pressed }) => [styles.searchAction, pressed && styles.buttonPressed]}
              >
                <Text style={styles.searchActionText}>Ontdek</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.searchStack}>
              <View style={styles.searchField}>
                <Ionicons name="search" size={20} color={COLORS.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Zoek op salon, behandeling of stad"
                  placeholderTextColor={COLORS.placeholder}
                  style={styles.searchInput}
                  returnKeyType="search"
                  onSubmitEditing={() => router.push(buildDiscoverHref(query) as never)}
                />
              </View>
              <Pressable
                onPress={() => router.push(buildDiscoverHref(query) as never)}
                style={({ pressed }) => [styles.searchAction, styles.searchActionMobile, pressed && styles.buttonPressed]}
              >
                <Text style={styles.searchActionText}>Ontdek salons</Text>
              </Pressable>
            </View>
          )}

          <CategoryChips
            items={categoryLabels}
            style={[styles.chipsRow, !desktop && styles.chipsRowMobile]}
            onChange={(label) => {
              const category = MARKETPLACE_CATEGORIES.find((item) => item.label === label);
              if (!category) return;
              router.push(`/salons/${DEFAULT_MARKETPLACE_CITY.slug}/${category.slug}` as never);
            }}
          />

          {desktop ? (
            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>Publiek</Text>
                <Text style={styles.metricLabel}>Vrij browsen zonder account</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>Video-first</Text>
                <Text style={styles.metricLabel}>Zie sfeer en resultaat direct</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>Guest booking</Text>
                <Text style={styles.metricLabel}>Boek met alleen e-mail</Text>
              </View>
            </View>
          ) : (
            <View style={styles.metricsPanel}>
              <View style={styles.metricRowCompact}>
                <Text style={styles.metricValueCompact}>Publiek</Text>
                <Text style={styles.metricLabelCompact}>Vrij browsen zonder account</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricRowCompact}>
                <Text style={styles.metricValueCompact}>Video-first</Text>
                <Text style={styles.metricLabelCompact}>Zie sfeer en resultaat direct</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricRowCompact}>
                <Text style={styles.metricValueCompact}>Guest booking</Text>
                <Text style={styles.metricLabelCompact}>Boek met alleen e-mail</Text>
              </View>
            </View>
          )}
        </View>

        {desktop ? (
          <View style={styles.heroAside}>
            <Text style={styles.heroAsideEyebrow}>Snel starten</Text>
            <Text style={styles.heroAsideTitle}>Zoek rustig, vergelijk snel.</Text>
            <Text style={styles.heroAsideText}>
              Gebruik de zijbalk om snel tussen ontdekken, feed en aanmeldingen te schakelen.
            </Text>
            <Pressable
              onPress={() => router.push("/discover?city=rotterdam" as never)}
              style={({ pressed }) => [styles.heroAsidePrimary, pressed && styles.buttonPressed]}
            >
              <Text style={styles.heroAsidePrimaryText}>Ontdek in Rotterdam</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(auth)/register" as never)}
              style={({ pressed }) => [styles.heroAsideSecondary, pressed && styles.buttonPressed]}
            >
              <Text style={styles.heroAsideSecondaryText}>Meld je salon gratis aan</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.sectionHeader, !desktop && styles.sectionHeaderMobile]}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionEyebrow}>Populaire salons</Text>
          <Text style={[styles.sectionTitle, !desktop && styles.sectionTitleMobile]}>
            Populaire salons in Nederland
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/discover" as never)}
          style={[styles.inlineLink, !desktop && styles.inlineLinkMobile]}
        >
          <Text style={styles.inlineLinkText}>Bekijk alles</Text>
          <Ionicons name="arrow-forward" size={15} color={COLORS.primary} />
        </Pressable>
      </View>

      <View style={[styles.listWrap, desktop && styles.listWrapDesktop]}>
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.listItem,
                  desktop && (popularColumns === 3 ? styles.listItemThird : styles.listItemHalf),
                ]}
              >
                <View style={styles.skeletonCard}>
                  <SkeletonBlock height={220} radius={20} />
                  <View style={styles.skeletonBody}>
                    <SkeletonBlock height={24} width="54%" radius={8} />
                    <SkeletonBlock height={16} width="28%" radius={8} />
                    <SkeletonBlock height={16} width="82%" radius={8} />
                  </View>
                </View>
              </View>
            ))
          : popularSalons.map((salon) => (
              <View
                key={salon.slug}
                style={[
                  styles.listItem,
                  desktop && (popularColumns === 3 ? styles.listItemThird : styles.listItemHalf),
                ]}
              >
                <MarketplaceSalonCard
                  salon={salon}
                  onPress={() => router.push(`/salon/${salon.slug}` as never)}
                />
              </View>
            ))}
      </View>

      <View style={styles.bottomStrip}>
        <Text style={styles.bottomStripEyebrow}>Waarom BookBeauty</Text>
        <Text style={styles.bottomStripTitle}>Reviews, prijzen en beschikbaarheid in één plek.</Text>
        <Text style={styles.bottomStripText}>
          Kies je stad en ontdek salons bij jou in de buurt. Boek zonder bellen en houd alles overzichtelijk op
          één plek.
        </Text>
        <Pressable
          onPress={() => router.push("/(auth)/register" as never)}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.buttonPressed]}
        >
          <Text style={styles.secondaryActionText}>Meld je salon gratis aan</Text>
        </Pressable>
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  heroShell: {
    gap: 24,
  },
  heroShellDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 24,
  },
  hero: {
    paddingTop: 8,
  },
  heroDesktop: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 48,
    lineHeight: 54,
    fontWeight: "700",
    letterSpacing: -1,
    maxWidth: 860,
  },
  titleDesktop: {
    fontSize: 52,
    lineHeight: 58,
    maxWidth: 760,
  },
  titleMobile: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    maxWidth: undefined,
  },
  subtitle: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 640,
  },
  subtitleMobile: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: undefined,
  },
  searchBar: {
    marginTop: 24,
    minHeight: 60,
    width: "100%",
    borderWidth: 0,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    shadowColor: "#172330",
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  searchBarDesktop: {
    maxWidth: 760,
  },
  searchStack: {
    marginTop: 24,
    gap: 12,
  },
  searchField: {
    minHeight: 52,
    borderWidth: 0,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  searchAction: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchActionMobile: {
    width: "100%",
    minHeight: 48,
    borderRadius: 18,
  },
  searchActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  chipsRow: {
    marginTop: 12,
    paddingBottom: 4,
  },
  chipsRowMobile: {
    marginTop: 12,
  },
  metricsRow: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricsPanel: {
    marginTop: 16,
    borderWidth: 0,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  metricRowCompact: {
    paddingVertical: 8,
    gap: 2,
  },
  metricDivider: {
    height: 1,
    backgroundColor: "rgba(17,17,17,0.06)",
  },
  metricValueCompact: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  metricLabelCompact: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  heroAside: {
    width: 320,
    borderWidth: 0,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    padding: 20,
    gap: 12,
    alignSelf: "stretch",
  },
  heroAsideEyebrow: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroAsideTitle: {
    color: COLORS.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  heroAsideText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  heroAsidePrimary: {
    marginTop: 4,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAsidePrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  heroAsideSecondary: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.08)",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAsideSecondaryText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  metric: {
    minWidth: 180,
    paddingRight: 4,
    gap: 2,
  },
  metricValue: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    marginTop: 32,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionHeaderMobile: {
    marginTop: 24,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  sectionCopy: {
    gap: 4,
  },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  sectionTitleMobile: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  inlineLink: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineLinkMobile: {
    minHeight: 40,
    paddingHorizontal: 14,
  },
  inlineLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  listWrap: {
    marginTop: 16,
    gap: 16,
  },
  listWrapDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "stretch",
  },
  listItem: {
    width: "100%",
  },
  listItemHalf: {
    width: "48.7%",
  },
  listItemThird: {
    width: "31.2%",
  },
  skeletonCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 16,
    shadowColor: "#172330",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  skeletonBody: {
    paddingTop: 12,
    gap: 8,
  },
  bottomStrip: {
    marginTop: 32,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    maxWidth: 760,
  },
  bottomStripEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  bottomStripTitle: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  bottomStripText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  secondaryAction: {
    marginTop: 4,
    alignSelf: "flex-start",
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 23,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});
