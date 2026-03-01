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
  MARKETPLACE_CITIES,
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
  const cityLabels = useMemo(() => MARKETPLACE_CITIES.map((item) => item.label), []);
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
          <Text style={styles.eyebrow}>Beauty salons in Nederland</Text>
          <Text style={[styles.title, desktop ? styles.titleDesktop : styles.titleMobile]}>
            Vind snel een salon die bij je past.
          </Text>
          <Text style={[styles.subtitle, !desktop && styles.subtitleMobile]}>
            Reviews, prijzen en beschikbaarheid direct op één plek.
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
            <View style={styles.mobileActionRow}>
              <Pressable
                onPress={() => router.push("/discover" as never)}
                style={({ pressed }) => [styles.mobileHeroPrimary, pressed && styles.buttonPressed]}
              >
                <Text style={styles.mobileHeroPrimaryText}>Ontdek salons</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/(auth)/register" as never)}
                style={({ pressed }) => [styles.mobileHeroSecondary, pressed && styles.buttonPressed]}
              >
                <Text style={styles.mobileHeroSecondaryText}>Meld je salon aan</Text>
              </Pressable>
            </View>
          )}

          <View style={[styles.trustStrip, desktop && styles.trustStripDesktop]}>
            <Text style={styles.trustText}>Geen account nodig om te bekijken</Text>
            <Text style={styles.trustDot}>•</Text>
            <Text style={styles.trustText}>Echte prijzen en reviews</Text>
            <Text style={styles.trustDot}>•</Text>
            <Text style={styles.trustText}>Snel online reserveren</Text>
          </View>
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

      <View style={styles.quickSection}>
        <Text style={styles.quickEyebrow}>Ontdek per stad</Text>
        <Text style={styles.quickTitle}>Kies direct je stad</Text>
        <Text style={styles.quickText}>
          Kies je stad en ontdek salons bij jou in de buurt. Boek zonder bellen en houd alles overzichtelijk op
          één plek.
        </Text>
        <CategoryChips
          items={cityLabels}
          style={styles.quickChips}
          onChange={(label) => {
            const city = MARKETPLACE_CITIES.find((item) => item.label === label);
            if (!city) return;
            router.push(`/salons/${city.slug}` as never);
          }}
        />
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

      <View style={[styles.quickSection, styles.quickSectionSecondary]}>
        <Text style={styles.quickEyebrow}>Behandelingen</Text>
        <Text style={styles.quickTitle}>Zoek op behandeling</Text>
        <Text style={styles.quickText}>Start met een categorie en bekijk direct salons, prijzen en tijden.</Text>
        <CategoryChips
          items={categoryLabels}
          style={styles.quickChips}
          onChange={(label) => {
            const category = MARKETPLACE_CATEGORIES.find((item) => item.label === label);
            if (!category) return;
            router.push(`/salons/${DEFAULT_MARKETPLACE_CITY.slug}/${category.slug}` as never);
          }}
        />
      </View>

      <View style={styles.bottomStrip}>
        <Text style={styles.bottomStripEyebrow}>Waarom BookBeauty</Text>
        <Text style={styles.bottomStripTitle}>Reviews, prijzen en beschikbaarheid in één plek.</Text>
        <Text style={styles.bottomStripText}>
          Vergelijk sneller, boek rustiger en houd alles op één plek.
        </Text>
        <View style={[styles.reasonGrid, desktop && styles.reasonGridDesktop]}>
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Vergelijk snel</Text>
            <Text style={styles.reasonText}>Zie direct prijs, rating en beschikbaarheid per salon.</Text>
          </View>
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Boek zonder bellen</Text>
            <Text style={styles.reasonText}>Verstuur je aanvraag direct online wanneer het jou uitkomt.</Text>
          </View>
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Alles overzichtelijk</Text>
            <Text style={styles.reasonText}>Bewaar favorieten en houd je boekingen eenvoudig bij.</Text>
          </View>
        </View>
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
    gap: 20,
  },
  heroShellDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 24,
  },
  hero: {
    paddingTop: 4,
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
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "700",
    letterSpacing: -0.8,
    maxWidth: 720,
  },
  titleDesktop: {
    fontSize: 50,
    lineHeight: 56,
    maxWidth: 700,
  },
  titleMobile: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    maxWidth: undefined,
  },
  subtitle: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 520,
  },
  subtitleMobile: {
    marginTop: 8,
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
  mobileActionRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
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
  mobileHeroPrimary: {
    flex: 1.2,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileHeroPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  mobileHeroSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileHeroSecondaryText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  searchActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  trustStrip: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  trustStripDesktop: {
    alignSelf: "flex-start",
  },
  trustText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  trustDot: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  heroAside: {
    width: 320,
    borderWidth: 0,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    padding: 18,
    gap: 10,
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
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  heroAsideText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
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
  quickSection: {
    marginTop: 20,
    gap: 8,
  },
  quickSectionSecondary: {
    marginTop: 28,
  },
  quickEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  quickTitle: {
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  quickText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 620,
  },
  quickChips: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  sectionHeader: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionHeaderMobile: {
    marginTop: 22,
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
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sectionTitleMobile: {
    fontSize: 18,
    lineHeight: 22,
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
    marginTop: 14,
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
    marginTop: 30,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 10,
    maxWidth: 860,
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
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  bottomStripText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  reasonGrid: {
    marginTop: 2,
    gap: 10,
  },
  reasonGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  reasonCard: {
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  reasonTitle: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  reasonText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
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
