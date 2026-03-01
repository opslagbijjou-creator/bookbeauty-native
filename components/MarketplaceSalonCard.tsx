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
  const priceLabel = salon.minPrice > 0 ? `Vanaf ${formatCurrency(salon.minPrice)}` : "Prijs op aanvraag";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.mediaWrap}>
        <Image
          source={{ uri: salon.coverImageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
        />

        {salon.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{salon.badge}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.copy}>
            <Text style={styles.name} numberOfLines={1}>
              {salon.name}
            </Text>
            <Text style={styles.city} numberOfLines={1}>
              {salon.city}
            </Text>
          </View>

          <View style={styles.ratingPill}>
            <Ionicons name="star" size={13} color="#f4b400" />
            <Text style={styles.ratingText}>{salon.rating.toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.category}>{salon.categoryLabel}</Text>
        <Text style={styles.bio} numberOfLines={2}>
          {salon.bio}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.price}>{priceLabel}</Text>
          <Text style={styles.reviews}>{salon.reviewCount} reviews</Text>
          <View style={styles.ctaInline}>
            <Text style={styles.ctaText}>Bekijk salon</Text>
            <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    shadowColor: "#172330",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  mediaWrap: {
    position: "relative",
  },
  image: {
    width: "100%",
    height: 220,
    backgroundColor: COLORS.surface,
  },
  badge: {
    position: "absolute",
    top: 16,
    left: 16,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: COLORS.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  city: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  ratingPill: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  category: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  bio: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
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
    gap: 5,
  },
  ctaText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },
});
