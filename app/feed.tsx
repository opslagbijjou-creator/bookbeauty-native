import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import SkeletonBlock from "../components/SkeletonBlock";
import {
  MarketplaceFeedItem,
  buildFeedSeo,
  fetchMarketplaceFeed,
} from "../lib/marketplace";
import { COLORS } from "../lib/ui";

export default function PublicFeedScreen() {
  const router = useRouter();
  const seo = buildFeedSeo();
  const [items, setItems] = useState<MarketplaceFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceFeed(8)
      .then((result) => {
        if (cancelled) return;
        setItems(result);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
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
    <MarketplaceShell active="feed">
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />

      <View style={styles.header}>
        <Text style={styles.kicker}>Public feed</Text>
        <Text style={styles.title}>Beauty discovery in motion</Text>
        <Text style={styles.subtitle}>
          Scroll door een TikTok-lite feed, maar met rust, duidelijke context en directe routes naar salonprofielen.
        </Text>
      </View>

      <View style={styles.stack}>
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <View key={index} style={styles.skeletonCard}>
                <SkeletonBlock height={360} />
                <SkeletonBlock height={24} width="70%" radius={10} />
                <SkeletonBlock height={18} width="92%" radius={10} />
                <SkeletonBlock height={18} width="60%" radius={10} />
              </View>
            ))
          : items.map((item) => (
              <View key={item.id} style={styles.feedCard}>
                <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" transition={220} />
                <View style={styles.feedBody}>
                  <Text style={styles.feedLabel}>{item.categoryLabel}</Text>
                  <Text style={styles.feedTitle}>{item.title}</Text>
                  <Text style={styles.feedCaption}>{item.caption}</Text>

                  <Pressable
                    onPress={() => router.push(`/salon/${item.companySlug}` as never)}
                    style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                  >
                    <Text style={styles.ctaText}>Bekijk bijbehorende salon</Text>
                  </Pressable>
                </View>
              </View>
            ))}
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: COLORS.card,
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
  },
  subtitle: {
    color: COLORS.muted,
    lineHeight: 22,
    fontSize: 15,
    maxWidth: 720,
  },
  stack: {
    marginTop: 18,
    gap: 18,
  },
  skeletonCard: {
    borderRadius: 24,
    backgroundColor: COLORS.card,
    padding: 18,
    gap: 12,
  },
  feedCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    shadowColor: "#102544",
    shadowOpacity: 0.05,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  poster: {
    width: "100%",
    height: 420,
    backgroundColor: COLORS.surface,
  },
  feedBody: {
    padding: 18,
    gap: 8,
  },
  feedLabel: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  feedTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 24,
    lineHeight: 30,
  },
  feedCaption: {
    color: COLORS.muted,
    lineHeight: 22,
    fontSize: 14,
  },
  cta: {
    marginTop: 4,
    alignSelf: "flex-start",
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
});

