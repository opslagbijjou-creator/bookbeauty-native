import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import {
  MarketplaceFeedItem,
  buildFeedSeo,
  fetchMarketplaceFeed,
} from "../lib/marketplace";
import { COLORS } from "../lib/ui";

export default function PublicFeedScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const seo = buildFeedSeo();
  const [items, setItems] = useState<MarketplaceFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const slideHeight = Math.max(560, height - 78);

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
    <MarketplaceShell active="feed" scroll={false} fullBleed>
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />

      <View style={styles.screen}>
        <ScrollView
          style={styles.flex}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
        >
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <View key={index} style={[styles.slide, { height: slideHeight, backgroundColor: COLORS.surface }]} />
              ))
            : items.map((item) => (
                <View key={item.id} style={[styles.slide, { height: slideHeight }]}>
                  <Image source={{ uri: item.posterUrl }} style={styles.media} contentFit="cover" transition={220} />
                  <LinearGradient
                    colors={["rgba(10,16,24,0.04)", "rgba(10,16,24,0.72)"]}
                    style={StyleSheet.absoluteFillObject}
                  />

                  <View style={styles.overlay}>
                    <View style={styles.copyWrap}>
                      <Text style={styles.categoryLabel}>{item.categoryLabel}</Text>
                      <Text style={styles.salonName}>{item.companyName}</Text>
                      <Text style={styles.title}>{item.title}</Text>
                      <Text style={styles.caption}>{item.caption}</Text>
                    </View>

                    <Pressable
                      onPress={() => router.push(`/salon/${item.companySlug}` as never)}
                      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                    >
                      <Text style={styles.ctaText}>Bekijk salon</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
        </ScrollView>
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1018",
  },
  flex: {
    flex: 1,
  },
  slide: {
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "#0b1018",
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0b1018",
  },
  overlay: {
    paddingHorizontal: 18,
    paddingBottom: 26,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  copyWrap: {
    flex: 1,
    gap: 6,
  },
  categoryLabel: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  salonName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  caption: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 560,
  },
  cta: {
    minHeight: 50,
    paddingHorizontal: 18,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
});
