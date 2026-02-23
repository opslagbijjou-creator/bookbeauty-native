import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { adminListCompanies, adminSetCompanyActive, adminSetCompanyBadge } from "../../../lib/companyAdminRepo";
import { CompanyPublic } from "../../../lib/companyRepo";
import { COLORS } from "../../../lib/ui";

const BADGES = ["Top Salon", "Verified", "Elite", "Trending"];

export default function AdminCompaniesScreen() {
  const [companies, setCompanies] = useState<CompanyPublic[]>([]);

  async function load() {
    const data = await adminListCompanies();
    setCompanies(data);
  }

  useEffect(() => {
    load().catch(() => null);
  }, []);

  async function onSetBadge(companyId: string, badge: string) {
    await adminSetCompanyBadge(companyId, badge);
    await load();
  }

  async function onToggleActive(companyId: string, isActive: boolean) {
    await adminSetCompanyActive(companyId, !isActive);
    await load();
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Ionicons name="business-outline" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Bedrijven beheren</Text>
      </View>

      <FlatList
        data={companies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.metaWrap}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.city || "-"}</Text>
                <Text style={styles.meta}>Totaal geboekt: {Math.max(0, Number(item.bookingCountTotal ?? 0))}</Text>
                <Text style={styles.meta}>Badge: {item.badge || "-"}</Text>
              </View>
              <Pressable style={styles.activeBtn} onPress={() => onToggleActive(item.id, Boolean(item.isActive))}>
                <Text style={styles.activeBtnText}>{item.isActive ? "Actief" : "Inactief"}</Text>
              </Pressable>
            </View>

            <View style={styles.badgesRow}>
              {BADGES.map((badge) => (
                <Pressable key={badge} style={styles.badgeBtn} onPress={() => onSetBadge(item.id, badge)}>
                  <Text style={styles.badgeBtnText}>{badge}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  list: {
    gap: 8,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 11,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  metaWrap: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 15,
  },
  meta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  activeBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 11,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badgeBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 11,
  },
});
