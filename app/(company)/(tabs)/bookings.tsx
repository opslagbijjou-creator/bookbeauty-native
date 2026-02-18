import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  acceptBooking,
  Booking,
  BookingStatus,
  fetchBookings,
  rejectBooking,
  subscribeBookings,
} from "../../../lib/bookingRepo";
import { auth } from "../../../lib/firebase";
import { COLORS } from "../../../lib/ui";

function statusLabel(status: BookingStatus): string {
  if (status === "confirmed") return "Geaccepteerd";
  if (status === "declined") return "Geweigerd";
  if (status === "cancelled_by_customer") return "Geannuleerd";
  return "In afwachting";
}

function statusPalette(status: BookingStatus): { bg: string; text: string; border: string } {
  if (status === "confirmed") return { bg: "#e6f7ec", text: "#1f7a3f", border: "#b6e3c2" };
  if (status === "declined") return { bg: "#ffedf1", text: "#c63957", border: "#f7c8d4" };
  if (status === "cancelled_by_customer") return { bg: "#f4f4f4", text: "#6b6b6b", border: "#d8d8d8" };
  return { bg: "#fff4df", text: "#9a6600", border: "#f1d29a" };
}

function formatDateTime(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toFriendlyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Er ging iets mis. Probeer opnieuw.";
}

function sortByStart(items: Booking[]): Booking[] {
  return [...items].sort((a, b) => a.startAtMs - b.startAtMs);
}

type BookingSectionProps = {
  title: string;
  items: Booking[];
  emptyText: string;
  busyBookingId: string | null;
  onAccept: (booking: Booking) => void;
  onReject: (booking: Booking) => void;
};

function BookingSection({ title, items, emptyText, busyBookingId, onAccept, onReject }: BookingSectionProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionCountPill}>
          <Text style={styles.sectionCountText}>{items.length}</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.sectionEmptyWrap}>
          <Text style={styles.sectionEmptyText}>{emptyText}</Text>
        </View>
      ) : (
        <View style={styles.sectionList}>
          {items.map((booking) => {
            const palette = statusPalette(booking.status);
            const isPending = booking.status === "pending";
            const isBusy = busyBookingId === booking.id;

            return (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingTop}>
                  <Text style={styles.bookingService} numberOfLines={1}>
                    {booking.serviceName}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: palette.bg,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: palette.text }]}>{statusLabel(booking.status)}</Text>
                  </View>
                </View>

                <Text style={styles.bookingMeta}>{booking.customerName}</Text>
                <Text style={styles.bookingMeta}>{formatDateTime(booking.startAtMs)}</Text>

                {isPending ? (
                  <View style={styles.pendingActionsRow}>
                    <Pressable
                      style={[styles.acceptBtn, isBusy && styles.disabled]}
                      onPress={() => onAccept(booking)}
                      disabled={isBusy}
                    >
                      <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                      <Text style={styles.acceptBtnText}>Accepteren</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.rejectBtn, isBusy && styles.disabled]}
                      onPress={() => onReject(booking)}
                      disabled={isBusy}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                      <Text style={styles.rejectBtnText}>Weigeren</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

type StateCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  loading?: boolean;
  ctaLabel?: string;
  onPressCta?: () => void;
};

function StateCard({ icon, title, description, loading, ctaLabel, onPressCta }: StateCardProps) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIconWrap}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>

      {loading ? <ActivityIndicator color={COLORS.primary} style={styles.stateSpinner} /> : null}

      {ctaLabel && onPressCta ? (
        <Pressable style={styles.stateCtaBtn} onPress={onPressCta}>
          <Ionicons name="refresh" size={14} color={COLORS.primary} />
          <Text style={styles.stateCtaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function BookingDashboardScreen() {
  const businessId = auth.currentUser?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const pendingBookings = useMemo(() => sortByStart(bookings.filter((row) => row.status === "pending")), [bookings]);
  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return sortByStart(bookings.filter((row) => row.status === "confirmed" && row.startAtMs >= now));
  }, [bookings]);
  const rejectedBookings = useMemo(() => sortByStart(bookings.filter((row) => row.status === "declined")), [bookings]);

  const pendingCount = pendingBookings.length;

  const retry = useCallback(() => {
    setReloadTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      setErrorMessage(null);
      setBookings([]);
      return;
    }

    console.log("[BookingDashboard] businessId:", businessId);
    console.log("[BookingDashboard] query start");

    setLoading(true);
    setErrorMessage(null);

    let active = true;
    let firstResponseHandled = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const resolveInitialLoad = () => {
      if (!active || firstResponseHandled) return;
      firstResponseHandled = true;
      clearWatchdog();
      setLoading(false);
    };

    const onQuerySuccess = (rows: Booking[]) => {
      if (!active) return;
      setBookings(sortByStart(rows));
      setErrorMessage(null);
      resolveInitialLoad();
      console.log("[BookingDashboard] query success count:", rows.length);
    };

    const onQueryError = (error: unknown) => {
      if (!active) return;
      console.log("[BookingDashboard] query error:", error);
      setErrorMessage("Boekingen laden mislukt. Probeer opnieuw.");
      resolveInitialLoad();
    };

    const unsubscribe = subscribeBookings(businessId, onQuerySuccess, onQueryError);

    fetchBookings(businessId)
      .then(onQuerySuccess)
      .catch(onQueryError);

    watchdog = setTimeout(() => {
      if (!active || firstResponseHandled) return;
      console.log("[BookingDashboard] query error:", "timeout");
      setErrorMessage("Laden duurt te lang. Controleer je verbinding en probeer opnieuw.");
      setLoading(false);
      firstResponseHandled = true;
    }, 9000);

    return () => {
      active = false;
      clearWatchdog();
      unsubscribe();
    };
  }, [businessId, reloadTick]);

  const setStatus = useCallback(
    async (booking: Booking, nextStatus: "confirmed" | "declined") => {
      if (!businessId || busyBookingId) return;

      const previousStatus = booking.status;
      setBusyBookingId(booking.id);
      setBookings((current) => current.map((row) => (row.id === booking.id ? { ...row, status: nextStatus } : row)));

      try {
        if (nextStatus === "confirmed") {
          await acceptBooking(booking.id, businessId);
        } else {
          await rejectBooking(booking.id, businessId);
        }
      } catch (error) {
        setBookings((current) => current.map((row) => (row.id === booking.id ? { ...row, status: previousStatus } : row)));
        Alert.alert("Actie mislukt", toFriendlyError(error));
      } finally {
        setBusyBookingId(null);
      }
    },
    [businessId, busyBookingId]
  );

  const onAccept = useCallback(
    (booking: Booking) => {
      setStatus(booking, "confirmed").catch(() => null);
    },
    [setStatus]
  );

  const onReject = useCallback(
    (booking: Booking) => {
      setStatus(booking, "declined").catch(() => null);
    },
    [setStatus]
  );

  const hasBookings = bookings.length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Boekingsdashboard</Text>
            <Text style={styles.headerSubtitle}>{pendingCount} aanvragen in afwachting</Text>
          </View>
        </View>

        {!businessId ? (
          <StateCard
            icon="lock-closed-outline"
            title="Niet ingelogd"
            description="Log opnieuw in om je boekingen te bekijken."
            ctaLabel="Ververs"
            onPressCta={retry}
          />
        ) : loading ? (
          <StateCard
            icon="hourglass-outline"
            title="Bezig met laden"
            description="We laden je boekingen in. Dit duurt meestal maar kort."
            loading
          />
        ) : errorMessage ? (
          <StateCard
            icon="alert-circle-outline"
            title="Kon niet laden"
            description={errorMessage}
            ctaLabel="Opnieuw proberen"
            onPressCta={retry}
          />
        ) : !hasBookings ? (
          <StateCard
            icon="file-tray-outline"
            title="Nog geen aanvragen"
            description="Nieuwe boekingsaanvragen verschijnen hier automatisch."
            ctaLabel="Ververs"
            onPressCta={retry}
          />
        ) : (
          <>
            <BookingSection
              title="In afwachting"
              items={pendingBookings}
              emptyText="Geen openstaande aanvragen."
              busyBookingId={busyBookingId}
              onAccept={onAccept}
              onReject={onReject}
            />

            <BookingSection
              title="Aankomend"
              items={upcomingBookings}
              emptyText="Geen geaccepteerde toekomstige afspraken."
              busyBookingId={busyBookingId}
              onAccept={onAccept}
              onReject={onReject}
            />

            {rejectedBookings.length > 0 ? (
              <BookingSection
                title="Geweigerd"
                items={rejectedBookings}
                emptyText="Nog geen geweigerde aanvragen."
                busyBookingId={busyBookingId}
                onAccept={onAccept}
                onReject={onReject}
              />
            ) : null}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 26,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  stateCard: {
    minHeight: 260,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    gap: 8,
  },
  stateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  stateDescription: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
  stateSpinner: {
    marginTop: 6,
  },
  stateCtaBtn: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stateCtaText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  sectionCountPill: {
    minWidth: 30,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sectionCountText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionEmptyWrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sectionEmptyText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  sectionList: {
    gap: 9,
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: 6,
  },
  bookingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  bookingService: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  bookingMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  pendingActionsRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  rejectBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f4c3d2",
    backgroundColor: "#fff0f5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  rejectBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
});
