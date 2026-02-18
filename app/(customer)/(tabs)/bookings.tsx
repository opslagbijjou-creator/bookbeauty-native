import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Booking,
  cancelBookingByCustomer,
  fetchCustomerBookings,
  subscribeCustomerBookings,
} from "../../../lib/bookingRepo";
import { auth } from "../../../lib/firebase";
import { COLORS } from "../../../lib/ui";

function statusLabel(status: Booking["status"]): string {
  if (status === "confirmed") return "Bevestigd";
  if (status === "declined") return "Niet geaccepteerd";
  if (status === "cancelled_by_customer") return "Geannuleerd";
  return "In afwachting";
}

function formatDateTime(startAtMs: number): string {
  if (!startAtMs) return "-";
  return new Date(startAtMs).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusPalette(status: Booking["status"]): { bg: string; text: string; border: string } {
  if (status === "confirmed") return { bg: "#e5f7ea", text: "#1f7a3f", border: "#b7e6c6" };
  if (status === "declined") return { bg: "#ffecef", text: "#c63957", border: "#f4c7d2" };
  if (status === "cancelled_by_customer") return { bg: "#f2f2f2", text: "#666", border: "#ddd" };
  return { bg: "#fff4df", text: "#9a6600", border: "#f1d29a" };
}

export default function CustomerBookingsScreen() {
  const uid = auth.currentUser?.uid ?? null;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const rows = await fetchCustomerBookings(uid);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeCustomerBookings(
      uid,
      (rows) => {
        setItems(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  async function onCancel(bookingId: string) {
    if (!uid || busyId) return;
    Alert.alert("Boeking annuleren", "Weet je zeker dat je deze boeking wilt annuleren?", [
      { text: "Nee", style: "cancel" },
      {
        text: "Ja, annuleren",
        style: "destructive",
        onPress: async () => {
          setBusyId(bookingId);
          try {
            await cancelBookingByCustomer(bookingId, uid);
            setItems((prev) =>
              prev.map((row) => (row.id === bookingId ? { ...row, status: "cancelled_by_customer" } : row))
            );
          } catch (error: any) {
            Alert.alert("Fout", error?.message ?? "Kon boeking niet annuleren.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.titleRow}>
        <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Mijn boekingen</Text>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const pending = item.status === "pending";
            const palette = statusPalette(item.status);
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.service}>{item.serviceName}</Text>
                  <View style={[styles.statusPill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
                    <Text style={[styles.statusText, { color: palette.text }]}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>{item.companyName}</Text>
                <Text style={styles.meta}>{formatDateTime(item.startAtMs)} • {item.serviceDurationMin} min</Text>
                <Text style={styles.meta}>EUR {item.servicePrice}</Text>

                {pending ? (
                  <Pressable
                    style={[styles.cancelBtn, busyId === item.id && styles.disabled]}
                    onPress={() => onCancel(item.id)}
                    disabled={busyId === item.id}
                  >
                    <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                    <Text style={styles.cancelText}>Annuleer boeking</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.stateWrap}>
              <Text style={styles.empty}>Nog geen boekingen.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 260,
  },
  list: {
    gap: 8,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  service: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontWeight: "800",
    fontSize: 10,
  },
  meta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  cancelBtn: {
    marginTop: 4,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#f2bfd2",
    backgroundColor: "#ffeef4",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  cancelText: {
    color: COLORS.danger,
    fontWeight: "800",
    fontSize: 12,
  },
  empty: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
});
