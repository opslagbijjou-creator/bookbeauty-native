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
      />

      <View style={[styles.heroShell, desktop && styles.heroShellDesktop]}>
        <View style={[styles.hero, desktop && styles.heroDesktop]}>
          <Text style={styles.eyebrow}>Beauty marketplace voor Nederland</Text>
          <Text style={[styles.title, desktop ? styles.titleDesktop : styles.titleMobile]}>
            Ontdek salons die goed voelen voordat je boekt.
          </Text>
          <Text style={[styles.subtitle, !desktop && styles.subtitleMobile]}>
            Scroll door echte media, vergelijk prijzen en vind in seconden een salon die past bij jouw stijl,
            budget en stad.
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
            <Text style={styles.heroAsideTitle}>Gebruik BookBeauty als een rustige, snelle marketplace.</Text>
            <Text style={styles.heroAsideText}>
              Op desktop navigeer je direct via de vaste zijbalk en vergelijk je sneller meerdere salons naast
              elkaar.
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
            Top keuzes die nu veel bekeken worden
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
        <Text style={styles.bottomStripEyebrow}>Voor salons</Text>
        <Text style={styles.bottomStripTitle}>Sta direct live en ontvang sneller aanvragen.</Text>
        <Text style={styles.bottomStripText}>
          Registreer je salon, laad je media in en verschijn meteen in discover zonder een lege marketplace.
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
    gap: 22,
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
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 48,
    lineHeight: 54,
    fontWeight: "900",
    letterSpacing: -1.2,
    maxWidth: 860,
  },
  titleDesktop: {
    fontSize: 56,
    lineHeight: 62,
    maxWidth: 760,
  },
  titleMobile: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
    maxWidth: undefined,
  },
  subtitle: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 17,
    lineHeight: 27,
    maxWidth: 760,
  },
  subtitleMobile: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: undefined,
  },
  searchBar: {
    marginTop: 28,
    minHeight: 68,
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  searchBarDesktop: {
    maxWidth: 760,
  },
  searchStack: {
    marginTop: 22,
    gap: 10,
  },
  searchField: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  searchAction: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchActionMobile: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
  },
  searchActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  chipsRow: {
    marginTop: 14,
    paddingBottom: 2,
  },
  chipsRowMobile: {
    marginTop: 10,
  },
  metricsRow: {
    marginTop: 26,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  metricsPanel: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  metricRowCompact: {
    paddingVertical: 10,
    gap: 3,
  },
  metricDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  metricValueCompact: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  metricLabelCompact: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  heroAside: {
    width: 320,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    padding: 22,
    gap: 12,
    alignSelf: "stretch",
  },
  heroAsideEyebrow: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  heroAsideTitle: {
    color: COLORS.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  heroAsideText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  heroAsidePrimary: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAsidePrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  heroAsideSecondary: {
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAsideSecondaryText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  metric: {
    minWidth: 180,
    paddingRight: 6,
    gap: 3,
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionHeader: {
    marginTop: 42,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 14,
  },
  sectionHeaderMobile: {
    marginTop: 28,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  sectionCopy: {
    gap: 4,
  },
  sectionEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  sectionTitleMobile: {
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  inlineLink: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: "rgba(23,59,99,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineLinkMobile: {
    minHeight: 44,
    paddingHorizontal: 16,
  },
  inlineLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  listWrap: {
    marginTop: 18,
    gap: 18,
  },
  listWrapDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
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
    padding: 14,
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  skeletonBody: {
    paddingTop: 14,
    gap: 10,
  },
  bottomStrip: {
    marginTop: 40,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 8,
    maxWidth: 760,
  },
  bottomStripEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bottomStripTitle: {
    color: COLORS.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  bottomStripText: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  secondaryAction: {
    marginTop: 6,
    alignSelf: "flex-start",
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});
