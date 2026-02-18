import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  acceptCompanyProposalByCustomer,
  Booking,
  cancelBookingByCustomer,
  declineCompanyProposalByCustomer,
  fetchCustomerBookings,
  requestSameDayRescheduleByCustomer,
  subscribeCustomerBookings,
} from "../../../lib/bookingRepo";
import { auth } from "../../../lib/firebase";
import { COLORS } from "../../../lib/ui";

function statusLabel(status: Booking["status"]): string {
  if (status === "confirmed") return "Bevestigd";
  if (status === "proposed_by_company") return "Nieuw voorstel";
  if (status === "pending_reschedule_approval") return "Verplaatsen in behandeling";
  if (status === "declined") return "Niet geaccepteerd";
  if (status === "cancelled_with_fee") return "Geannuleerd (15% fee)";
  if (status === "cancelled_by_customer") return "Geannuleerd";
  return "Aanvraag verstuurd";
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
  if (status === "proposed_by_company") return { bg: "#e8f0ff", text: "#2a5fcf", border: "#c6d8ff" };
  if (status === "pending_reschedule_approval") return { bg: "#eaf6ff", text: "#0f6d99", border: "#c7e8fa" };
  if (status === "declined") return { bg: "#ffecef", text: "#c63957", border: "#f4c7d2" };
  if (status === "cancelled_with_fee") return { bg: "#fff1e8", text: "#af552a", border: "#f3d2be" };
  if (status === "cancelled_by_customer") return { bg: "#f2f2f2", text: "#666", border: "#ddd" };
  return { bg: "#fff4df", text: "#9a6600", border: "#f1d29a" };
}

function formatCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "Start binnenkort";
  const totalMin = Math.floor(diff / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `Over ${days}d ${hours}u`;
  if (hours > 0) return `Over ${hours}u ${minutes}m`;
  return `Over ${minutes}m`;
}

function isSameDay(dateKey: string): boolean {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateKey === key;
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
            const result = await cancelBookingByCustomer(bookingId, uid);
            setItems((prev) =>
              prev.map((row) =>
                row.id === bookingId
                  ? {
                      ...row,
                      status: result.feePercent > 0 ? "cancelled_with_fee" : "cancelled_by_customer",
                      cancellationFeePercent: result.feePercent,
                      cancellationFeeAmount: result.feeAmount,
                    }
                  : row
              )
            );
            if (result.feePercent > 0) {
              Alert.alert(
                "Geannuleerd met fee",
                `Te laat geannuleerd. ${result.feePercent}% (${result.feeAmount.toFixed(2)} EUR) wordt ingehouden.`
              );
            }
          } catch (error: any) {
            Alert.alert("Fout", error?.message ?? "Kon boeking niet annuleren.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  async function onAcceptProposal(bookingId: string) {
    if (!uid || busyId) return;
    setBusyId(bookingId);
    try {
      await acceptCompanyProposalByCustomer(bookingId, uid);
      setItems((prev) => prev.map((row) => (row.id === bookingId ? { ...row, status: "confirmed" } : row)));
    } catch (error: any) {
      Alert.alert("Kon voorstel niet bevestigen", error?.message ?? "Probeer het opnieuw.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDeclineProposal(bookingId: string) {
    if (!uid || busyId) return;
    setBusyId(bookingId);
    try {
      await declineCompanyProposalByCustomer(bookingId, uid);
      setItems((prev) => prev.map((row) => (row.id === bookingId ? { ...row, status: "declined" } : row)));
    } catch (error: any) {
      Alert.alert("Kon voorstel niet weigeren", error?.message ?? "Probeer het opnieuw.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRequestMove(bookingId: string) {
    if (!uid || busyId) return;
    setBusyId(bookingId);
    try {
      const res = await requestSameDayRescheduleByCustomer(bookingId, uid);
      const proposedTime = new Date(res.proposedStartAtMs).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      Alert.alert("Verplaatsing aangevraagd", `Voorstel verzonden: ${proposedTime}. Het bedrijf moet nog akkoord geven.`);
      setItems((prev) =>
        prev.map((row) =>
          row.id === bookingId
            ? {
                ...row,
                status: "pending_reschedule_approval",
              }
            : row
        )
      );
    } catch (error: any) {
      Alert.alert("Kon niet verplaatsen", error?.message ?? "Probeer het opnieuw.");
    } finally {
      setBusyId(null);
    }
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
            const proposal = item.status === "proposed_by_company";
            const reschedulePending = item.status === "pending_reschedule_approval";
            const canMoveSameDay =
              item.status === "confirmed" && isSameDay(item.bookingDate) && (item.customerRescheduleCount || 0) < 1;
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
                {item.status === "confirmed" ? (
                  <Text style={styles.countdown}>{formatCountdown(item.startAtMs)}</Text>
                ) : null}
                {proposal && item.proposedStartAtMs ? (
                  <Text style={styles.proposalMeta}>
                    Nieuwe tijd:{" "}
                    {new Date(item.proposedStartAtMs).toLocaleString("nl-NL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                ) : null}
                {reschedulePending ? (
                  <Text style={styles.proposalMeta}>Je verplaatsingsverzoek wacht op akkoord van het bedrijf.</Text>
                ) : null}
                {item.status === "cancelled_with_fee" ? (
                  <Text style={styles.feeText}>
                    Ingehouden: {item.cancellationFeePercent}% ({item.cancellationFeeAmount.toFixed(2)} EUR)
                  </Text>
                ) : null}

                {proposal ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.acceptBtn, busyId === item.id && styles.disabled]}
                      onPress={() => onAcceptProposal(item.id)}
                      disabled={busyId === item.id}
                    >
                      <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                      <Text style={styles.acceptBtnText}>Accepteer voorstel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.rejectBtn, busyId === item.id && styles.disabled]}
                      onPress={() => onDeclineProposal(item.id)}
                      disabled={busyId === item.id}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                      <Text style={styles.rejectBtnText}>Weiger</Text>
                    </Pressable>
                  </View>
                ) : null}

                {canMoveSameDay ? (
                  <Pressable
                    style={[styles.moveBtn, busyId === item.id && styles.disabled]}
                    onPress={() => onRequestMove(item.id)}
                    disabled={busyId === item.id}
                  >
                    <Ionicons name="swap-horizontal-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.moveText}>Verplaats 1x (zelfde dag)</Text>
                  </Pressable>
                ) : null}

                {pending || proposal ? (
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
  actionRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  acceptBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#b7e6c6",
    backgroundColor: "#34b36b",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  acceptBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  rejectBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#f2bfd2",
    backgroundColor: "#fff5f8",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  rejectBtnText: {
    color: COLORS.danger,
    fontWeight: "800",
    fontSize: 12,
  },
  moveBtn: {
    marginTop: 6,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#f2f7ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  moveText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  countdown: {
    color: "#1f7a3f",
    fontWeight: "800",
    fontSize: 12,
  },
  proposalMeta: {
    color: "#2a5fcf",
    fontWeight: "700",
    fontSize: 12,
  },
  feeText: {
    color: "#af552a",
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
