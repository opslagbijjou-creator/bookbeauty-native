import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompanyService } from "../lib/serviceRepo";
import { COLORS } from "../lib/ui";

type ServiceCardProps = {
  service: CompanyService;
  ratingAvg?: number;
  ratingCount?: number;
  myRating?: number | null;
  canRate?: boolean;
  onRate?: (score: number) => void;
  onBookNow?: () => void;
  onMoreInfo?: () => void;
};

export default function ServiceCard({
  service,
  ratingAvg,
  ratingCount,
  myRating,
  canRate,
  onRate,
  onBookNow,
  onMoreInfo,
}: ServiceCardProps) {
  const avg = ratingAvg ?? 0;
  const count = ratingCount ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.nameWrap}>
          <View style={styles.iconBadge}>
            <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {service.name}
          </Text>
        </View>
        <View style={styles.pricePill}>
          <Text style={styles.price}>EUR {service.price}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Ionicons name="pricetag-outline" size={13} color={COLORS.primary} />
          <Text style={styles.category}>{service.category}</Text>
        </View>
        <View style={styles.metaPill}>
          <Ionicons name="time-outline" size={13} color={COLORS.primary} />
          <Text style={styles.duration}>{service.durationMin} min</Text>
        </View>
      </View>

      {service.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {service.description}
        </Text>
      ) : null}

      <View style={styles.ratingCard}>
        <View style={styles.ratingTop}>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={12} color="#f7b500" />
            <Text style={styles.ratingAvg}>{avg.toFixed(1)}</Text>
          </View>
          <Text style={styles.ratingMeta}>
            {count} {count === 1 ? "review" : "reviews"}
          </Text>
        </View>

        {canRate ? (
          <View style={styles.ratingStars}>
            {[1, 2, 3, 4, 5].map((score) => {
              const active = (myRating ?? 0) >= score;
              return (
                <Pressable key={score} style={styles.starBtn} onPress={() => onRate?.(score)}>
                  <Ionicons
                    name={active ? "star" : "star-outline"}
                    size={18}
                    color={active ? "#f7b500" : COLORS.muted}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {onBookNow || onMoreInfo ? (
        <View style={styles.actionRow}>
          {onMoreInfo ? (
            <Pressable style={styles.moreBtn} onPress={onMoreInfo}>
              <Ionicons name="images-outline" size={13} color={COLORS.primary} />
              <Text style={styles.moreText}>Meer info</Text>
            </Pressable>
          ) : null}
          {onBookNow ? (
            <Pressable style={styles.bookBtn} onPress={onBookNow}>
              <Ionicons name="calendar-outline" size={13} color="#fff" />
              <Text style={styles.bookText}>Boek nu</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nameWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  name: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 15,
  },
  pricePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  price: {
    color: COLORS.primary,
    fontWeight: "900",
    fontSize: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  category: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  description: {
    color: COLORS.muted,
    lineHeight: 18,
    fontSize: 12,
  },
  ratingCard: {
    marginTop: 2,
    backgroundColor: "#fff8ec",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f6dfad",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  ratingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff2d6",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#f3d7a0",
  },
  ratingAvg: {
    color: "#7f5312",
    fontWeight: "900",
    fontSize: 12,
  },
  ratingMeta: {
    color: "#9a6a25",
    fontSize: 11,
    fontWeight: "700",
  },
  ratingStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  starBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f3d7a0",
  },
  duration: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  moreBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  moreText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  bookBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  bookText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
});
