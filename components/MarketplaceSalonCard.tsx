import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { MarketplaceSalon, formatCurrency } from "../lib/marketplace";
import { COLORS } from "../lib/ui";

type MarketplaceSalonCardProps = {
  salon: MarketplaceSalon;
  onPress: () => void;
};

export default function MarketplaceSalonCard({ salon, onPress }: MarketplaceSalonCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Image
        source={{ uri: salon.coverImageUrl }}
        style={styles.cover}
        contentFit="cover"
        transition={220}
        cachePolicy="memory-disk"
      />

      <View style={styles.body}>
        <View style={styles.rowTop}>
          <View style={styles.titleWrap}>
            <Text style={styles.name} numberOfLines={1}>
              {salon.name}
            </Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {salon.categoryLabel} • {salon.city}
            </Text>
          </View>

          <View style={styles.ratingPill}>
            <Ionicons name="star" size={12} color="#ffffff" />
            <Text style={styles.ratingText}>{salon.rating.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.bio} numberOfLines={2}>
          {salon.bio}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.infoPill}>
            <Ionicons name="pricetag-outline" size={14} color={COLORS.primary} />
            <Text style={styles.infoText}>Vanaf {formatCurrency(salon.minPrice)}</Text>
          </View>
          <View style={styles.infoPill}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.primary} />
            <Text style={styles.infoText}>{salon.reviewCount} reviews</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.tagsRow}>
            {salon.tags.slice(0, 2).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={styles.cta}>
            <Text style={styles.ctaText}>Bekijk salon</Text>
            <Ionicons name="arrow-forward" size={14} color="#ffffff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 280,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#102544",
    shadowOpacity: 0.07,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cover: {
    width: "100%",
    height: 220,
    backgroundColor: COLORS.surface,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primary,
  },
  ratingText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
  },
  bio: {
    color: COLORS.muted,
    lineHeight: 20,
    fontSize: 14,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
});

