// FILE: components/CompanyCard.tsx
import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Company } from "../lib/companyRepo";

const CARD = "#FFFFFF";
const BORDER = "#E9D3DF";
const PINK = "#E45AA6";
const TEXT = "#1E1E1E";
const MUTED = "#6B6B6B";

export function CompanyCard({ c, onPress }: { c: Company; onPress?: () => void }) {
  const cats = (c.categories ?? []).slice(0, 3).join(" • ");
  const price = c.minPrice != null ? `vanaf €${c.minPrice}` : "";

  return (
    <Pressable style={styles.companyCard} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.companyName} numberOfLines={1}>
          {c.name || "Salon"}
        </Text>

        <Text style={styles.companyMeta} numberOfLines={1}>
          {c.city}
          {price ? ` • ${price}` : ""}
        </Text>

        {cats ? (
          <Text style={styles.companyCats} numberOfLines={1}>
            {cats}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Bekijk</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={MUTED} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  companyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  companyName: { fontSize: 16, fontWeight: "900", color: TEXT },
  companyMeta: { marginTop: 2, fontWeight: "800", color: MUTED },
  companyCats: { marginTop: 6, fontWeight: "800", color: "#7B1247" },

  right: { flexDirection: "row", alignItems: "center", gap: 10 },

  cta: {
    backgroundColor: PINK,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  ctaText: { color: "white", fontWeight: "900" },
});