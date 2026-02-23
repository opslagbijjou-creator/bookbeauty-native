import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  fetchAdminPlatformMetrics,
  fetchAdminTopCompaniesByBookings,
  type AdminCompanySnapshot,
  type AdminPlatformMetrics,
} from "../../../lib/adminRepo";
import { subscribeOnlineUsersCount } from "../../../lib/presenceRepo";
import { COLORS } from "../../../lib/ui";

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>
        <Ionicons name={icon} size={15} color={COLORS.primary} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<AdminPlatformMetrics | null>(null);
  const [companies, setCompanies] = useState<AdminCompanySnapshot[]>([]);
  const [onlineNowLive, setOnlineNowLive] = useState<number | null>(null);

  async function load() {
    const [dashboard, topCompanies] = await Promise.all([
      fetchAdminPlatformMetrics(),
      fetchAdminTopCompaniesByBookings(),
    ]);
    setMetrics(dashboard);
    setCompanies(topCompanies);
  }

  useEffect(() => {
    load()
      .catch((error) => {
        console.warn("[admin/dashboard] load failed", error);
      })
      .finally(() => setLoading(false));

    return subscribeOnlineUsersCount(
      (count) => setOnlineNowLive(count),
      () => setOnlineNowLive(null)
    );
  }, []);

  async function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const onlineNowValue = useMemo(() => {
    if (onlineNowLive === null || Number.isNaN(onlineNowLive)) {
      return metrics?.onlineNow ?? "-";
    }
    return onlineNowLive;
  }, [onlineNowLive, metrics?.onlineNow]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="shield-checkmark-outline" size={19} color={COLORS.primary} />
            <Text style={styles.title}>BookBeauty Admin</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={onRefresh} disabled={refreshing}>
            <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />
            <Text style={styles.refreshText}>{refreshing ? "Laden..." : "Refresh"}</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <>
            <View style={styles.quickGrid}>
              <MetricCard
                icon="people-outline"
                label="Gebruikers"
                value={metrics?.users.total ?? "-"}
                sub={`${metrics?.users.customers ?? 0} klanten, ${metrics?.users.companies ?? 0} bedrijven`}
              />
              <MetricCard
                icon="radio-outline"
                label="Online nu"
                value={onlineNowValue}
                sub={`live in laatste 5 min`}
              />
              <MetricCard
                icon="calendar-outline"
                label="Boekingen"
                value={metrics?.bookings.total ?? "-"}
                sub={`${metrics?.bookings.confirmed ?? 0} bevestigd`}
              />
              <MetricCard
                icon="notifications-outline"
                label="Meldingen / booking"
                value={metrics?.notifications.perBooking ?? "-"}
                sub={`${metrics?.notifications.bookingRelated ?? 0} booking-gerelateerd`}
              />
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="chatbubbles-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Support overzicht</Text>
              </View>
              <Text style={styles.sectionText}>
                {metrics?.support.totalThreads ?? 0} totaal, {metrics?.support.openThreads ?? 0} open, {" "}
                {metrics?.support.unreadForAdmin ?? 0} wachten op team.
              </Text>
              <Pressable style={styles.sectionBtn} onPress={() => router.push("/(admin)/(tabs)/support" as never)}>
                <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                <Text style={styles.sectionBtnText}>Open support inbox</Text>
              </Pressable>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="stats-chart-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Top bedrijven op boekingen</Text>
              </View>
              {companies.length ? (
                <View style={styles.companyList}>
                  {companies.map((company) => (
                    <View key={company.id} style={styles.companyRow}>
                      <View style={styles.companyMeta}>
                        <Text style={styles.companyName} numberOfLines={1}>
                          {company.name}
                        </Text>
                        <Text style={styles.companyCity}>{company.city || "-"}</Text>
                      </View>
                      <Text style={styles.companyCount}>{company.bookingCountTotal}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sectionText}>Nog geen bedrijfsdata.</Text>
              )}
              <View style={styles.sectionActions}>
                <Pressable style={styles.sectionBtn} onPress={() => router.push("/(admin)/(tabs)/companies" as never)}>
                  <Ionicons name="business-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.sectionBtnText}>Beheer bedrijven</Text>
                </Pressable>
                <Pressable style={styles.sectionBtn} onPress={() => router.push("/(admin)/(tabs)/profile" as never)}>
                  <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.sectionBtnText}>Open team-profiel</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.footRow}>
              <Text style={styles.footText}>
                Rollen: {metrics?.users.influencers ?? 0} influencers, {metrics?.users.employees ?? 0} medewerkers, {" "}
                {metrics?.users.admins ?? 0} admins.
              </Text>
              <Text style={styles.footText}>Bedrijven totaal: {metrics?.companiesTotal ?? 0}</Text>
              <Text style={styles.footText}>Meldingen totaal: {metrics?.notifications.total ?? 0}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 14,
    gap: 10,
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
  },
  refreshBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  refreshText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 11,
  },
  loadingWrap: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    width: "48.8%",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 3,
  },
  metricIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  metricValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 21,
  },
  metricSub: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 11,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    padding: 11,
    gap: 7,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 15,
  },
  sectionText: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 18,
  },
  sectionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
  },
  sectionBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  companyList: {
    gap: 7,
  },
  companyRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  companyMeta: {
    flex: 1,
  },
  companyName: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  companyCity: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 11,
    marginTop: 1,
  },
  companyCount: {
    color: COLORS.primary,
    fontWeight: "900",
    fontSize: 15,
  },
  sectionActions: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  footRow: {
    gap: 2,
  },
  footText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
});
