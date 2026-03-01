import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  const [query, setQuery] = useState("");
  const [popularSalons, setPopularSalons] = useState<MarketplaceSalon[]>([]);
  const [loading, setLoading] = useState(true);
  const seo = buildHomeSeo();
  const categoryLabels = useMemo(() => MARKETPLACE_CATEGORIES.slice(0, 6).map((item) => item.label), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceListing({
      citySlug: DEFAULT_MARKETPLACE_CITY.slug,
      filters: { sort: "popular" },
    })
      .then((result) => {
        if (cancelled) return;
        setPopularSalons(result.items.slice(0, 5));
      })
      .catch(() => {
        if (cancelled) return;
        setPopularSalons(DEMO_MARKETPLACE_SALONS.slice(0, 5));
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

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Marketplace voor beauty</Text>
        <Text style={styles.title}>Vind een salon die past bij je stijl, prijs en moment.</Text>
        <Text style={styles.subtitle}>
          Zoek direct door salons, behandelingen en populaire beautycategorieen zonder eerst in te loggen.
        </Text>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Zoek op salon, behandeling of stad"
            placeholderTextColor={COLORS.placeholder}
            style={styles.searchInput}
          />
          <Pressable
            onPress={() => router.push(buildDiscoverHref(query) as never)}
            style={({ pressed }) => [styles.searchAction, pressed && styles.buttonPressed]}
          >
            <Text style={styles.searchActionText}>Zoeken</Text>
          </Pressable>
        </View>

        <CategoryChips
          items={categoryLabels}
          onChange={(label) => {
            const category = MARKETPLACE_CATEGORIES.find((item) => item.label === label);
            if (!category) return;
            router.push(`/salons/${DEFAULT_MARKETPLACE_CITY.slug}/${category.slug}` as never);
          }}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Populaire salons</Text>
        <Pressable onPress={() => router.push("/discover" as never)} style={styles.inlineLink}>
          <Text style={styles.inlineLinkText}>Bekijk alles</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.text} />
        </Pressable>
      </View>

      <View style={styles.listWrap}>
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <View key={index} style={styles.skeletonRow}>
                <SkeletonBlock height={118} width={118} radius={0} />
                <View style={styles.skeletonInfo}>
                  <SkeletonBlock height={20} width="68%" radius={6} />
                  <SkeletonBlock height={16} width="42%" radius={6} />
                  <SkeletonBlock height={16} width="90%" radius={6} />
                  <SkeletonBlock height={16} width="70%" radius={6} />
                </View>
              </View>
            ))
          : popularSalons.map((salon) => (
              <MarketplaceSalonCard
                key={salon.slug}
                salon={salon}
                onPress={() => router.push(`/salon/${salon.slug}` as never)}
              />
            ))}
      </View>

      <View style={styles.bottomStrip}>
        <Text style={styles.bottomStripTitle}>Voor salons</Text>
        <Text style={styles.bottomStripText}>
          Sluit aan, ga direct live in de marketplace en ontvang boekingsaanvragen zonder loginmuur voor klanten.
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
  hero: {
    paddingTop: 8,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "900",
    letterSpacing: -1,
    maxWidth: 760,
  },
  subtitle: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 720,
  },
  searchBar: {
    marginTop: 22,
    minHeight: 62,
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  searchAction: {
    minHeight: 42,
    paddingHorizontal: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionHeader: {
    marginTop: 30,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  inlineLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  inlineLinkText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  listWrap: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  skeletonRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  skeletonInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  bottomStrip: {
    marginTop: 32,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  bottomStripTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  bottomStripText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 720,
  },
  secondaryAction: {
    marginTop: 6,
    alignSelf: "flex-start",
    minHeight: 46,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});
