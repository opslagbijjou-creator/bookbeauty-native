import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

type PaidRevenueBooking = {
  id: string;
  companyId: string;
  companyName: string;
  amountCents: number;
  platformFeeCents: number;
  salonNetCents: number;
  paidAtMs: number;
  serviceName: string;
  customerName: string;
};

function toCents(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function toMillis(value: unknown): number {
  const node = value as { toMillis?: () => number } | Date | null | undefined;
  if (node && typeof node === "object" && "toMillis" in node && typeof node.toMillis === "function") {
    return node.toMillis();
  }
  if (node instanceof Date) return node.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function isPaid(data: Record<string, unknown>): boolean {
  const paymentStatus = String(data.paymentStatus ?? "").trim().toLowerCase();
  const mollieStatus = String((data.mollie as Record<string, unknown> | undefined)?.status ?? "")
    .trim()
    .toLowerCase();
  const status = String(data.status ?? "").trim().toLowerCase();
  const paid = paymentStatus === "paid" || mollieStatus === "paid" || status === "paid";
  return paid && status === "completed";
}

function parsePaidBooking(id: string, data: Record<string, unknown>): PaidRevenueBooking {
  const breakdown = (data.breakdown as Record<string, unknown> | undefined) ?? {};
  const amountCents = toCents(breakdown.amountCents) || toCents(data.amountCents) || Math.round(Number(data.servicePrice || 0) * 100);
  const platformFeeCents = toCents(breakdown.platformFeeCents) || Math.round(amountCents * 0.08);
  const salonNetCents =
    toCents(breakdown.salonNetCents) ||
    toCents(breakdown.companyNetCents) ||
    Math.max(0, amountCents - platformFeeCents);

  return {
    id,
    companyId: String(data.companyId ?? "").trim(),
    companyName: String(data.companyName ?? "").trim(),
    amountCents,
    platformFeeCents,
    salonNetCents,
    paidAtMs:
      toMillis((data.mollie as Record<string, unknown> | undefined)?.paidAt) ||
      toMillis(data.updatedAt) ||
      toMillis(data.confirmedAtMs),
    serviceName: String(data.serviceName ?? "").trim(),
    customerName: String(data.customerName ?? "").trim(),
  };
}

function formatCurrency(cents: number): string {
  return (Math.max(0, cents) / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthKey(ms: number): string {
  if (!ms) return "Onbekend";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export default function AdminRevenueScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PaidRevenueBooking[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "bookings"));
        if (cancelled) return;
        const paidRows = snap.docs
          .map((row) => ({ id: row.id, data: row.data() as Record<string, unknown> }))
          .filter((row) => isPaid(row.data))
          .map((row) => parsePaidBooking(row.id, row.data))
          .sort((a, b) => b.paidAtMs - a.paidAtMs);
        setRows(paidRows);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.gmvCents += row.amountCents;
        acc.platformRevenueCents += row.platformFeeCents;
        acc.salonNetCents += row.salonNetCents;
        acc.transactions += 1;
        return acc;
      },
      { gmvCents: 0, platformRevenueCents: 0, salonNetCents: 0, transactions: 0 }
    );
  }, [rows]);

  const bySalon = useMemo(() => {
    const map = new Map<string, { companyId: string; companyName: string; transactions: number; gmvCents: number; platformRevenueCents: number; salonNetCents: number }>();
    rows.forEach((row) => {
      const key = row.companyId || "onbekend";
      const current = map.get(key) || {
        companyId: key,
        companyName: row.companyName || row.companyId || "Onbekend bedrijf",
        transactions: 0,
        gmvCents: 0,
        platformRevenueCents: 0,
        salonNetCents: 0,
      };
      current.transactions += 1;
      current.gmvCents += row.amountCents;
      current.platformRevenueCents += row.platformFeeCents;
      current.salonNetCents += row.salonNetCents;
      if (!current.companyName && row.companyName) current.companyName = row.companyName;
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.platformRevenueCents - a.platformRevenueCents);
  }, [rows]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { key: string; transactions: number; gmvCents: number; platformRevenueCents: number; salonNetCents: number }>();
    rows.forEach((row) => {
      const key = monthKey(row.paidAtMs);
      const current = map.get(key) || {
        key,
        transactions: 0,
        gmvCents: 0,
        platformRevenueCents: 0,
        salonNetCents: 0,
      };
      current.transactions += 1;
      current.gmvCents += row.amountCents;
      current.platformRevenueCents += row.platformFeeCents;
      current.salonNetCents += row.salonNetCents;
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [rows]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
            <Text style={styles.backText}>Terug</Text>
          </Pressable>
          <Text style={styles.title}>Platform Revenue</Text>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Total platform revenue</Text>
                <Text style={styles.metricValue}>{formatCurrency(totals.platformRevenueCents)}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Total GMV</Text>
                <Text style={styles.metricValue}>{formatCurrency(totals.gmvCents)}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Total salon net</Text>
                <Text style={styles.metricValue}>{formatCurrency(totals.salonNetCents)}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Total transactions</Text>
                <Text style={styles.metricValue}>{totals.transactions}</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Revenue per booking</Text>
              {rows.length === 0 ? (
                <Text style={styles.emptyText}>Nog geen paid bookings.</Text>
              ) : (
                rows.slice(0, 120).map((row) => (
                  <View key={row.id} style={styles.itemRow}>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemTitle}>{row.companyName || row.companyId || "Onbekend bedrijf"}</Text>
                      <Text style={styles.itemSub}>
                        {row.serviceName || "Dienst"} · {row.customerName || "Klant"}
                      </Text>
                      <Text style={styles.itemDate}>{formatDate(row.paidAtMs)}</Text>
                    </View>
                    <View style={styles.itemValues}>
                      <Text style={styles.itemGross}>{formatCurrency(row.amountCents)}</Text>
                      <Text style={styles.itemFee}>Fee {formatCurrency(row.platformFeeCents)}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Revenue per salon</Text>
              {bySalon.length === 0 ? (
                <Text style={styles.emptyText}>Nog geen salons met paid bookings.</Text>
              ) : (
                bySalon.map((row) => (
                  <View key={row.companyId || row.companyName} style={styles.itemRow}>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemTitle}>{row.companyName || row.companyId || "Onbekend bedrijf"}</Text>
                      <Text style={styles.itemSub}>{row.transactions} transacties</Text>
                    </View>
                    <View style={styles.itemValues}>
                      <Text style={styles.itemFee}>{formatCurrency(row.platformRevenueCents)}</Text>
                      <Text style={styles.itemSub}>{formatCurrency(row.gmvCents)} GMV</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Monthly breakdown</Text>
              {byMonth.length === 0 ? (
                <Text style={styles.emptyText}>Nog geen maanddata.</Text>
              ) : (
                byMonth.map((row) => (
                  <View key={row.key} style={styles.itemRow}>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemTitle}>{row.key}</Text>
                      <Text style={styles.itemSub}>{row.transactions} transacties</Text>
                    </View>
                    <View style={styles.itemValues}>
                      <Text style={styles.itemFee}>{formatCurrency(row.platformRevenueCents)}</Text>
                      <Text style={styles.itemSub}>{formatCurrency(row.gmvCents)} GMV</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
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
  topRow: {
    gap: 8,
  },
  backBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
  },
  loaderWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  metricRow: {
    borderTopWidth: 1,
    borderTopColor: "#f2e8ee",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  itemRow: {
    borderWidth: 1,
    borderColor: "#f1dfe8",
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  itemMeta: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  itemSub: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  itemDate: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  itemValues: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemGross: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  itemFee: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },
});
