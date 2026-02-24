import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

type AdminOverview = {
  users: number;
  paidBookings: number;
  openPayments: number;
};

type DashboardCard = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: number;
  subtitle?: string;
};

function StatCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={16} color={COLORS.primary} />
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {subtitle ? <Text style={styles.statSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export default function AdminIndexScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview>({ users: 0, paidBookings: 0, openPayments: 0 });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [usersSnap, paidSnap, openSnap] = await Promise.all([
          getCountFromServer(collection(db, "users")),
          getCountFromServer(query(collection(db, "bookings"), where("paymentStatus", "==", "paid"))),
          getCountFromServer(query(collection(db, "bookings"), where("paymentStatus", "==", "open"))),
        ]);

        if (cancelled) return;
        setOverview({
          users: usersSnap.data().count,
          paidBookings: paidSnap.data().count,
          openPayments: openSnap.data().count,
        });
      } catch {
        if (cancelled) return;
        setOverview({ users: 0, paidBookings: 0, openPayments: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo<DashboardCard[]>(
    () => [
      {
        icon: "people-outline" as const,
        title: "Totaal gebruikers",
        value: overview.users,
      },
      {
        icon: "card-outline" as const,
        title: "Betaalde transacties",
        value: overview.paidBookings,
      },
      {
        icon: "time-outline" as const,
        title: "Open betalingen",
        value: overview.openPayments,
      },
    ],
    [overview.openPayments, overview.paidBookings, overview.users]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Text style={styles.subtitle}>Platform-only betalingen, users beheer en omzet controle.</Text>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.grid}>
            {cards.map((card) => (
              <StatCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                value={card.value}
                subtitle={card.subtitle}
              />
            ))}
          </View>
        )}

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>Beheer</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/(admin)/revenue" as never)}>
            <Ionicons name="cash-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Open revenue dashboard</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/(admin)/users" as never)}>
            <Ionicons name="people-outline" size={16} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Open users beheer</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/(admin)/(tabs)" as never)}>
            <Ionicons name="apps-outline" size={16} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Open bestaande admin tabs</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  loaderWrap: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    width: "48.8%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 11,
    gap: 4,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  statTitle: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  statValue: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  statSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  actionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  actionTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },
  primaryBtn: {
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryBtn: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
  },
});
