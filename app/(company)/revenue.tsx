import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getUserRole } from "../../lib/authRepo";
import { auth, db } from "../../lib/firebase";
import { getEmployeeCompanyId } from "../../lib/staffRepo";
import { COLORS } from "../../lib/ui";

type PaidBookingRevenue = {
  id: string;
  amountCents: number;
  platformFeeCents: number;
  salonNetCents: number;
  paidAtMs: number;
  customerName: string;
  serviceName: string;
};

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

function toCents(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function isPaidBooking(data: Record<string, unknown>): boolean {
  const paymentStatus = String(data.paymentStatus ?? "").trim().toLowerCase();
  const mollieStatus = String((data.mollie as Record<string, unknown> | undefined)?.status ?? "")
    .trim()
    .toLowerCase();
  const status = String(data.status ?? "").trim().toLowerCase();
  const paid = paymentStatus === "paid" || mollieStatus === "paid" || status === "paid";
  return paid && status === "completed";
}

function parseRevenueRow(id: string, data: Record<string, unknown>): PaidBookingRevenue {
  const breakdown = (data.breakdown as Record<string, unknown> | undefined) ?? {};
  const amountCentsRaw =
    toCents(breakdown.amountCents) || toCents(data.amountCents) || Math.round(Number(data.servicePrice || 0) * 100);
  const platformFeeCentsRaw =
    toCents(breakdown.platformFeeCents) || Math.round(Math.max(0, amountCentsRaw) * 0.08);
  const salonNetRaw =
    toCents(breakdown.salonNetCents) ||
    toCents(breakdown.companyNetCents) ||
    Math.max(0, amountCentsRaw - platformFeeCentsRaw);

  const paidAtMs =
    toMillis((data.mollie as Record<string, unknown> | undefined)?.paidAt) ||
    toMillis(data.updatedAt) ||
    toMillis(data.confirmedAtMs);

  return {
    id,
    amountCents: amountCentsRaw,
    platformFeeCents: platformFeeCentsRaw,
    salonNetCents: salonNetRaw,
    paidAtMs,
    customerName: String(data.customerName ?? "").trim(),
    serviceName: String(data.serviceName ?? "").trim(),
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

function formatDateTime(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CompanyRevenueScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [rows, setRows] = useState<PaidBookingRevenue[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const uid = String(auth.currentUser?.uid || "").trim();
      if (!uid) {
        setError("Log opnieuw in om omzet te bekijken.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const role = await getUserRole(uid).catch(() => null);
        let companyId = uid;
        if (role === "employee") {
          companyId = (await getEmployeeCompanyId(uid)) || "";
        }
        if (!companyId) {
          throw new Error("Geen bedrijf gekoppeld aan dit account.");
        }

        const [companySnap, bookingsSnap] = await Promise.all([
          getDoc(doc(db, "companies_public", companyId)),
          getDocs(query(collection(db, "bookings"), where("companyId", "==", companyId))),
        ]);

        if (cancelled) return;

        const name = companySnap.exists() ? String(companySnap.data().name ?? "").trim() : "";
        setCompanyName(name);

        const paidRows = bookingsSnap.docs
          .map((row) => ({ id: row.id, data: row.data() as Record<string, unknown> }))
          .filter((row) => isPaidBooking(row.data))
          .map((row) => parseRevenueRow(row.id, row.data))
          .sort((a, b) => b.paidAtMs - a.paidAtMs);

        setRows(paidRows);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Kon omzet niet laden.");
        setRows([]);
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
        acc.amountCents += row.amountCents;
        acc.platformFeeCents += row.platformFeeCents;
        acc.salonNetCents += row.salonNetCents;
        return acc;
      },
      { amountCents: 0, platformFeeCents: 0, salonNetCents: 0 }
    );
  }, [rows]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
            <Text style={styles.backText}>Terug</Text>
          </Pressable>
          <Text style={styles.title}>Omzet overzicht</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{companyName || "Jouw salon"}</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Totaal ontvangen</Text>
            <Text style={styles.metricValue}>{formatCurrency(totals.salonNetCents)}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Totaal betalingen</Text>
            <Text style={styles.metricValue}>{formatCurrency(totals.amountCents)}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Platform fee totaal</Text>
            <Text style={styles.metricValue}>{formatCurrency(totals.platformFeeCents)}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Betaalde boekingen</Text>
            <Text style={styles.metricValue}>{rows.length}</Text>
          </View>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Betaalde boekingen</Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.emptyText}>Nog geen betaalde boekingen gevonden.</Text>
          ) : (
            rows.map((row) => (
              <View key={row.id} style={styles.rowCard}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle}>{row.serviceName || "Dienst"}</Text>
                  <Text style={styles.rowDate}>{formatDateTime(row.paidAtMs)}</Text>
                </View>
                <Text style={styles.rowSub}>{row.customerName || "Klant"}</Text>
                <View style={styles.rowTotals}>
                  <Text style={styles.rowAmount}>Bruto {formatCurrency(row.amountCents)}</Text>
                  <Text style={styles.rowFee}>Fee {formatCurrency(row.platformFeeCents)}</Text>
                  <Text style={styles.rowNet}>Jij {formatCurrency(row.salonNetCents)}</Text>
                </View>
              </View>
            ))
          )}
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
    fontSize: 26,
    fontWeight: "900",
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  summaryTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f3eaf0",
    paddingTop: 8,
    gap: 10,
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  listCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 12,
    gap: 10,
  },
  listTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },
  center: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 13,
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 13,
  },
  rowCard: {
    borderWidth: 1,
    borderColor: "#f1dce7",
    borderRadius: 12,
    padding: 10,
    gap: 6,
    backgroundColor: COLORS.surface,
  },
  rowHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
    flex: 1,
  },
  rowDate: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 11,
  },
  rowSub: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  rowTotals: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  rowAmount: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  rowFee: {
    color: "#8d5a17",
    fontWeight: "700",
    fontSize: 12,
  },
  rowNet: {
    color: COLORS.success,
    fontWeight: "800",
    fontSize: 12,
  },
});
