import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { CompanyPublic } from "../lib/companyRepo";
import { COLORS } from "../lib/ui";

type CompanyCardProps = {
  company: CompanyPublic;
  onPress?: () => void;
};

export default function CompanyCard({ company, onPress }: CompanyCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <View style={styles.logoWrap}>
            {company.logoUrl ? (
              <Image source={{ uri: company.logoUrl }} style={styles.logoImg} contentFit="cover" />
            ) : (
              <Ionicons name="business" size={14} color={COLORS.primary} />
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {company.name}
          </Text>
          {company.badge ? (
            <View style={styles.badgeMini}>
              <Ionicons name="shield-checkmark" size={11} color="#fff" />
              <Text style={styles.badgeMiniText}>{company.badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.badge}>
          <Ionicons name="location-outline" size={12} color={COLORS.muted} />
          <Text style={styles.city} numberOfLines={1}>
            {company.city}
          </Text>
        </View>
      </View>

      <Text style={styles.bio} numberOfLines={2}>
        {company.bio || "Geen bio toegevoegd."}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Ionicons name="cash-outline" size={14} color={COLORS.primary} />
          <Text style={styles.meta}>Vanaf EUR {company.minPrice || 0}</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="pricetags-outline" size={14} color={COLORS.primary} />
          <Text style={styles.meta} numberOfLines={1}>
            {company.categories.join(" • ") || "Overig"}
          </Text>
        </View>
      </View>

      <View style={styles.button}>
        <Text style={styles.buttonText}>Bekijk</Text>
        <Ionicons name="chevron-forward" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    gap: 7,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 120,
    gap: 4,
  },
  badgeMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeMiniText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  city: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 11,
  },
  bio: {
    color: COLORS.muted,
    lineHeight: 18,
    fontSize: 13,
  },
  metaRow: {
    gap: 6,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  meta: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  button: {
    marginTop: 2,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
});
