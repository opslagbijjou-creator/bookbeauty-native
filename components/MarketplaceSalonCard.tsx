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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Image
        source={{ uri: salon.coverImageUrl }}
        style={styles.image}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />

      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {salon.name}
          </Text>
          <View style={styles.ratingWrap}>
            <Ionicons name="star" size={12} color={COLORS.primary} />
            <Text style={styles.ratingText}>{salon.rating.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.meta} numberOfLines={1}>
          {salon.categoryLabel} in {salon.city}
        </Text>
        <Text style={styles.bio} numberOfLines={2}>
          {salon.bio}
        </Text>

        <View style={styles.bottomLine}>
          <Text style={styles.price}>Vanaf {formatCurrency(salon.minPrice)}</Text>
          <Text style={styles.reviews}>{salon.reviewCount} reviews</Text>
          <View style={styles.ctaInline}>
            <Text style={styles.ctaText}>Bekijk salon</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.text} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  image: {
    width: 118,
    height: 118,
    backgroundColor: COLORS.surface,
  },
  info: {
    flex: 1,
    justifyContent: "space-between",
    gap: 6,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  ratingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  bio: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  bottomLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  price: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  reviews: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  ctaInline: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ctaText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
