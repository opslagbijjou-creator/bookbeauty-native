import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { confirmAction } from "../../../lib/confirmAction";
import { auth } from "../../../lib/firebase";
import { COLORS } from "../../../lib/ui";

type CustomerSectionKey = "action" | "upcoming" | "history";
type BusyAction = "cancel" | "accept_proposal" | "decline_proposal" | "request_move" | "pay";

type BookingSections = {
  action: Booking[];
  upcoming: Booking[];
  history: Booking[];
};

function statusLabel(status: Booking["status"]): string {
  if (status === "confirmed") return "Bevestigd";
  if (status === "reschedule_requested") return "Wijziging aangevraagd";
  if (status === "checked_in") return "Aangekomen";
  if (status === "completed") return "Afgerond";
  if (status === "no_show") return "Niet komen opdagen";
  if (status === "cancelled") return "Geannuleerd";
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
  if (status === "reschedule_requested") return { bg: "#eaf6ff", text: "#0f6d99", border: "#c7e8fa" };
  if (status === "checked_in") return { bg: "#e8f4ff", text: "#1d5fa7", border: "#c9ddf8" };
  if (status === "completed") return { bg: "#e8fff3", text: "#147547", border: "#b9f0d2" };
  if (status === "no_show") return { bg: "#fff1e8", text: "#af552a", border: "#f3d2be" };
  if (status === "cancelled") return { bg: "#f2f2f2", text: "#666", border: "#ddd" };
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

function canCancelBooking(status: Booking["status"]): boolean {
  return (
    status === "pending" ||
    status === "reschedule_requested" ||
    status === "confirmed"
  );
}

function normalizePaymentStatus(item: Booking): string {
  const status = String(item.paymentStatus || "").trim().toLowerCase();
  if (status) return status;
  const mollie = String(item.mollieStatus || "").trim().toLowerCase();
  if (mollie === "cancelled") return "canceled";
  return mollie;
}

function paymentNeedsAction(item: Booking): boolean {
  const status = normalizePaymentStatus(item);
  return (
    status === "open" ||
    status === "pending_payment" ||
    status === "failed" ||
    status === "canceled" ||
    status === "expired"
  );
}

function isPaymentPending(item: Booking): boolean {
  const status = normalizePaymentStatus(item);
  return status === "open" || status === "pending_payment";
}

function isPaymentRetryable(item: Booking): boolean {
  const status = normalizePaymentStatus(item);
  return status === "failed";
}

function paymentStateLabel(item: Booking): string | null {
  const status = normalizePaymentStatus(item);
  if (status === "paid") return "Betaling gelukt";
  if (status === "open" || status === "pending_payment") return "Wacht op betaling";
  if (status === "failed") return "Betaling mislukt";
  if (status === "canceled") return "Betaling geannuleerd";
  if (status === "expired") return "Betaling verlopen";
  return null;
}

async function createMollieCheckoutForBooking(item: Booking): Promise<string> {
  const bookingId = String(item.id || "").trim();
  const companyId = String(item.companyId || "").trim();
  const amountCents = Math.max(0, Math.floor(Number(item.amountCents || Math.round(item.servicePrice * 100)) || 0));
  if (!bookingId || !companyId || amountCents <= 0) {
    throw new Error("Onvolledige betaalgegevens voor deze boeking.");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Je sessie is verlopen. Log opnieuw in.");

  const baseUrlRaw = String(process.env.EXPO_PUBLIC_APP_BASE_URL || "https://www.bookbeauty.nl").trim();
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const endpoint =
    Platform.OS === "web"
      ? "/.netlify/functions/mollie-create-payment"
      : `${baseUrl}/.netlify/functions/mollie-create-payment`;
  const idToken = await currentUser.getIdToken(true).catch(() => "");
  if (!idToken) throw new Error("Kon geen geldige sessie vinden voor betaling.");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      bookingId,
      companyId,
      amountCents,
    }),
  }).catch(() => null);

  if (!res) throw new Error("Geen verbinding met betaalserver.");
  const payload = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || payload.ok !== true) {
    throw new Error(String(payload.error || "").trim() || "Kon betaling niet starten.");
  }

  const checkoutUrl = String(payload.checkoutUrl || "").trim();
  if (!checkoutUrl) throw new Error("Mollie checkout URL ontbreekt.");
  return checkoutUrl;
}

async function openExternalCheckout(checkoutUrl: string): Promise<void> {
  if (Platform.OS === "web") {
    const win = globalThis as {
      location?: { assign?: (href: string) => void; href?: string };
      open?: (url?: string, target?: string) => void;
    };
    if (typeof win.location?.assign === "function") {
      win.location.assign(checkoutUrl);
      return;
    }
    if (win.location) {
      win.location.href = checkoutUrl;
      return;
    }
    if (typeof win.open === "function") {
      win.open(checkoutUrl, "_self");
      return;
    }
  }
  await Linking.openURL(checkoutUrl);
}

async function syncBookingPaymentStatus(bookingId: string): Promise<void> {
  const cleanBookingId = String(bookingId || "").trim();
  if (!cleanBookingId) return;
  const baseUrlRaw = String(process.env.EXPO_PUBLIC_APP_BASE_URL || "https://www.bookbeauty.nl").trim();
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const endpoint =
    Platform.OS === "web"
      ? "/.netlify/functions/mollie-sync-payment"
      : `${baseUrl}/.netlify/functions/mollie-sync-payment`;

  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bookingId: cleanBookingId,
    }),
  }).catch(() => null);
}

function bookingSection(booking: Booking, now: number): CustomerSectionKey {
  if (paymentNeedsAction(booking)) return "action";
  if (
    booking.status === "pending" ||
    booking.status === "reschedule_requested"
  ) {
    return "action";
  }
  if ((booking.status === "confirmed" || booking.status === "checked_in") && booking.startAtMs >= now) return "upcoming";
  return "history";
}

function normalizeParamValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length) return value.trim();
  return null;
}

export default function CustomerBookingsScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [activeSection, setActiveSection] = useState<CustomerSectionKey>("action");
  const [focusedBookingId, setFocusedBookingId] = useState<string | null>(null);
  const paymentSyncAtRef = useRef<Record<string, number>>({});

  const routeBookingId = useMemo(() => normalizeParamValue(params.bookingId), [params.bookingId]);

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

  useEffect(() => {
    setFocusedBookingId(routeBookingId);
  }, [routeBookingId]);

  const sections = useMemo<BookingSections>(() => {
    const now = Date.now();
    const next: BookingSections = {
      action: [],
      upcoming: [],
      history: [],
    };

    items.forEach((booking) => {
      next[bookingSection(booking, now)].push(booking);
    });

    next.action.sort((a, b) => a.startAtMs - b.startAtMs);
    next.upcoming.sort((a, b) => a.startAtMs - b.startAtMs);
    next.history.sort((a, b) => b.startAtMs - a.startAtMs);
    return next;
  }, [items]);

  useEffect(() => {
    if (!focusedBookingId) return;
    const target = items.find((item) => item.id === focusedBookingId);
    if (!target) return;
    setActiveSection(bookingSection(target, Date.now()));
  }, [focusedBookingId, items]);

  useEffect(() => {
    if (activeSection === "action" && sections.action.length > 0) return;
    if (activeSection === "upcoming" && sections.upcoming.length > 0) return;
    if (activeSection === "history" && sections.history.length > 0) return;

    if (sections.action.length > 0) {
      setActiveSection("action");
      return;
    }
    if (sections.upcoming.length > 0) {
      setActiveSection("upcoming");
      return;
    }
    if (sections.history.length > 0) {
      setActiveSection("history");
    }
  }, [activeSection, sections.action.length, sections.history.length, sections.upcoming.length]);

  useEffect(() => {
    const now = Date.now();
    const toSync = items
      .filter((row) => isPaymentPending(row))
      .filter((row) => now - Number(paymentSyncAtRef.current[row.id] || 0) > 15_000)
      .slice(0, 5);
    if (!toSync.length) return;
    let cancelled = false;

    (async () => {
      for (const row of toSync) {
        if (cancelled) return;
        paymentSyncAtRef.current[row.id] = Date.now();
        await syncBookingPaymentStatus(row.id);
      }
    })().catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [items]);

  const activeItems = sections[activeSection];
  const hasFocusedBooking = Boolean(focusedBookingId && items.some((item) => item.id === focusedBookingId));

  async function onCancel(bookingId: string) {
    if (!uid || busyId) return;
    const confirmed = await confirmAction({
      title: "Boeking annuleren",
      message: "Weet je zeker dat je deze boeking wilt annuleren?",
      confirmText: "Ja, annuleren",
      cancelText: "Nee",
      destructive: true,
    });
    if (!confirmed) return;

    setBusyId(bookingId);
    setBusyAction("cancel");
    try {
      const result = await cancelBookingByCustomer(bookingId, uid);
      setItems((prev) =>
        prev.map((row) =>
          row.id === bookingId
            ? {
                ...row,
                status: "cancelled",
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
      } else {
        Alert.alert("Boeking geannuleerd", "Je afspraak is geannuleerd.");
      }
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon boeking niet annuleren.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function onAcceptProposal(booking: Booking) {
    if (!uid || busyId) return;
    setBusyId(booking.id);
    setBusyAction("accept_proposal");
    try {
      await acceptCompanyProposalByCustomer(booking.id, uid);
      setItems((prev) =>
        prev.map((row) =>
          row.id === booking.id
            ? {
                ...row,
                bookingDate: booking.proposedBookingDate || row.bookingDate,
                startAtMs: booking.proposedStartAtMs || row.startAtMs,
                endAtMs: booking.proposedEndAtMs || row.endAtMs,
                occupiedStartAtMs: booking.proposedOccupiedStartAtMs || row.occupiedStartAtMs,
                occupiedEndAtMs: booking.proposedOccupiedEndAtMs || row.occupiedEndAtMs,
                proposalBy: undefined,
                proposedBookingDate: undefined,
                proposedStartAtMs: undefined,
                proposedEndAtMs: undefined,
                proposedOccupiedStartAtMs: undefined,
                proposedOccupiedEndAtMs: undefined,
                proposedAtMs: undefined,
                proposalNote: undefined,
                status: "confirmed",
              }
            : row
        )
      );
      Alert.alert("Voorstel geaccepteerd", "Je afspraak is bijgewerkt naar het nieuwe tijdstip.");
    } catch (error: any) {
      Alert.alert("Kon voorstel niet bevestigen", error?.message ?? "Probeer het opnieuw.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function onDeclineProposal(bookingId: string) {
    if (!uid || busyId) return;
    setBusyId(bookingId);
    setBusyAction("decline_proposal");
    try {
      await declineCompanyProposalByCustomer(bookingId, uid);
      setItems((prev) => prev.map((row) => (row.id === bookingId ? { ...row, status: "cancelled" } : row)));
      Alert.alert("Voorstel geweigerd", "Het voorstel is geweigerd.");
    } catch (error: any) {
      Alert.alert("Kon voorstel niet weigeren", error?.message ?? "Probeer het opnieuw.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function onRequestMove(bookingId: string) {
    if (!uid || busyId) return;
    setBusyId(bookingId);
    setBusyAction("request_move");
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
                status: "reschedule_requested",
                proposalBy: "customer",
                proposedStartAtMs: res.proposedStartAtMs,
              }
            : row
        )
      );
    } catch (error: any) {
      Alert.alert("Kon niet verplaatsen", error?.message ?? "Probeer het opnieuw.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function onPayNow(item: Booking) {
    if (busyId) return;
    setBusyId(item.id);
    setBusyAction("pay");
    try {
      const checkoutUrl = await createMollieCheckoutForBooking(item);
      await openExternalCheckout(checkoutUrl);
    } catch (error: any) {
      Alert.alert("Betaling starten mislukt", error?.message ?? "Kon betaling niet starten.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  function sectionTitle(section: CustomerSectionKey): string {
    if (section === "action") return "Actie nodig";
    if (section === "upcoming") return "Aankomende afspraken";
    return "Geschiedenis";
  }

  function sectionEmptyText(section: CustomerSectionKey): string {
    if (section === "action") return "Geen acties nodig op dit moment.";
    if (section === "upcoming") return "Geen aankomende afspraken.";
    return "Nog geen afgeronde of geannuleerde afspraken.";
  }

  function renderBookingCard(item: Booking) {
    const paymentStatus = normalizePaymentStatus(item);
    const paymentLabel = paymentStateLabel(item);
    const paymentPending = isPaymentPending(item);
    const paymentRetryable = isPaymentRetryable(item);
    const paymentActionRequired = paymentNeedsAction(item);
    const bookingFlowLocked = paymentActionRequired;
    const proposal = !bookingFlowLocked && item.status === "reschedule_requested" && item.proposalBy === "company";
    const reschedulePending =
      !bookingFlowLocked && item.status === "reschedule_requested" && item.proposalBy === "customer";
    const cancellable = canCancelBooking(item.status);
    const canMoveSameDay =
      !bookingFlowLocked &&
      (item.status === "confirmed" || item.status === "checked_in") &&
      isSameDay(item.bookingDate) &&
      (item.customerRescheduleCount || 0) < 1;
    const palette = statusPalette(item.status);
    const isFocused = focusedBookingId === item.id;
    const isBusy = busyId === item.id;
    const cancelBusy = isBusy && busyAction === "cancel";
    const acceptBusy = isBusy && busyAction === "accept_proposal";
    const declineBusy = isBusy && busyAction === "decline_proposal";
    const moveBusy = isBusy && busyAction === "request_move";
    const payBusy = isBusy && busyAction === "pay";

    return (
      <View key={item.id} style={[styles.bookingCard, isFocused && styles.bookingCardFocused]}>
        <View style={styles.bookingTopRow}>
          <Text style={styles.bookingService} numberOfLines={1}>
            {item.serviceName}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            <Text style={[styles.statusText, { color: palette.text }]}>{statusLabel(item.status)}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="business-outline" size={13} color={COLORS.muted} />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.companyName}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={COLORS.muted} />
          <Text style={styles.metaText}>
            {formatDateTime(item.startAtMs)} • {item.serviceDurationMin} min
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="cash-outline" size={13} color={COLORS.muted} />
          <Text style={styles.metaText}>EUR {Number(item.servicePrice || 0).toFixed(2)}</Text>
        </View>

        {paymentLabel ? (
          <View style={styles.metaRow}>
            <Ionicons
              name={
                paymentStatus === "paid"
                  ? "checkmark-done-circle-outline"
                  : paymentStatus === "failed"
                    ? "alert-circle-outline"
                    : paymentStatus === "canceled" || paymentStatus === "expired"
                      ? "close-circle-outline"
                      : "card-outline"
              }
              size={13}
              color={paymentStatus === "paid" ? "#1f7a3f" : paymentStatus === "failed" ? COLORS.danger : COLORS.primary}
            />
            <Text style={styles.metaText}>{paymentLabel}</Text>
          </View>
        ) : null}

        {item.status === "confirmed" || item.status === "checked_in" ? (
          <Text style={styles.countdown}>{formatCountdown(item.startAtMs)}</Text>
        ) : null}

        {proposal && item.proposedStartAtMs ? (
          <Text style={styles.proposalMeta}>
            Nieuwe tijd: {" "}
            {new Date(item.proposedStartAtMs).toLocaleString("nl-NL", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        ) : null}

        {proposal && item.proposalNote ? (
          <View style={styles.proposalNoteCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color="#3861bf" />
            <Text style={styles.proposalNoteText}>{item.proposalNote}</Text>
          </View>
        ) : null}

        {reschedulePending ? (
          <Text style={styles.proposalMeta}>Je verplaatsingsverzoek wacht op akkoord van het bedrijf.</Text>
        ) : null}

        {paymentPending ? (
          <View style={styles.paymentInfoCard}>
            <Ionicons name="card-outline" size={14} color={COLORS.primary} />
            <Text style={styles.paymentInfoText}>
              Open betaling: rond je betaling af om deze boeking te laten doorgaan.
            </Text>
          </View>
        ) : null}

        {paymentRetryable ? (
          <View style={styles.paymentInfoCard}>
            <Ionicons name="alert-circle-outline" size={14} color={COLORS.danger} />
            <Text style={styles.paymentInfoText}>Betaling mislukt. Probeer opnieuw om verder te gaan.</Text>
          </View>
        ) : null}

        {paymentStatus === "canceled" || paymentStatus === "expired" ? (
          <View style={styles.paymentInfoCard}>
            <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
            <Text style={styles.paymentInfoText}>
              Deze betaling is gestopt. Maak een nieuwe boeking als je verder wilt.
            </Text>
          </View>
        ) : null}

        {item.status === "cancelled" && (item.cancellationFeePercent || 0) > 0 ? (
          <Text style={styles.feeText}>
            Ingehouden: {item.cancellationFeePercent || 0}% ({Number(item.cancellationFeeAmount || 0).toFixed(2)} EUR)
          </Text>
        ) : null}

        {item.status === "cancelled" ? (
          <Pressable
            style={[styles.moveBtn, isBusy && styles.disabled]}
            onPress={() => router.push("/(customer)/(tabs)/discover" as never)}
            disabled={isBusy}
          >
            <Ionicons name="search-outline" size={14} color={COLORS.primary} />
            <Text style={styles.moveText}>Bekijk alternatieve professionals</Text>
          </Pressable>
        ) : null}

        {(paymentPending || paymentRetryable) ? (
          <Pressable style={[styles.payBtn, isBusy && styles.disabled]} onPress={() => onPayNow(item)} disabled={isBusy}>
            {payBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="card-outline" size={14} color="#fff" />
            )}
            <Text style={styles.payBtnText}>
              {payBusy ? "Openen..." : paymentPending ? "Betaal om door te gaan" : "Probeer betaling opnieuw"}
            </Text>
          </Pressable>
        ) : null}

        {(paymentStatus === "canceled" || paymentStatus === "expired") ? (
          <Pressable
            style={[styles.moveBtn, isBusy && styles.disabled]}
            onPress={() =>
              router.push(`/(customer)/book/${encodeURIComponent(item.companyId)}/${encodeURIComponent(item.serviceId)}` as never)
            }
            disabled={isBusy}
          >
            <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />
            <Text style={styles.moveText}>Boek opnieuw</Text>
          </Pressable>
        ) : null}

        {proposal ? (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.acceptBtn, isBusy && styles.disabled]}
              onPress={() => onAcceptProposal(item)}
              disabled={isBusy}
            >
              {acceptBusy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
              )}
              <Text style={styles.acceptBtnText}>{acceptBusy ? "Bezig..." : "Accepteer voorstel"}</Text>
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, isBusy && styles.disabled]}
              onPress={() => onDeclineProposal(item.id)}
              disabled={isBusy}
            >
              {declineBusy ? (
                <ActivityIndicator size="small" color={COLORS.danger} />
              ) : (
                <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
              )}
              <Text style={styles.rejectBtnText}>{declineBusy ? "Bezig..." : "Weiger"}</Text>
            </Pressable>
          </View>
        ) : null}

        {canMoveSameDay ? (
          <Pressable
            style={[styles.moveBtn, isBusy && styles.disabled]}
            onPress={() => onRequestMove(item.id)}
            disabled={isBusy}
          >
            {moveBusy ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="swap-horizontal-outline" size={14} color={COLORS.primary} />
            )}
            <Text style={styles.moveText}>{moveBusy ? "Bezig..." : "Verplaats 1x (zelfde dag)"}</Text>
          </Pressable>
        ) : null}

        {cancellable ? (
          <Pressable
            style={[styles.cancelBtn, isBusy && styles.disabled]}
            onPress={() => onCancel(item.id)}
            disabled={isBusy}
          >
            {cancelBusy ? (
              <ActivityIndicator size="small" color={COLORS.danger} />
            ) : (
              <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
            )}
            <Text style={styles.cancelText}>{cancelBusy ? "Annuleren..." : "Annuleer boeking"}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.titleRow}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
            <Text style={styles.title}>Mijn boekingen</Text>
          </View>
          <Text style={styles.subtitle}>Overzichtelijk en direct gekoppeld aan je meldingen.</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Actie nodig</Text>
            <Text style={styles.summaryValue}>{sections.action.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Aankomend</Text>
            <Text style={styles.summaryValue}>{sections.upcoming.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Afgerond</Text>
            <Text style={styles.summaryValue}>{sections.history.length}</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {[
            { key: "action", label: "Actie nodig", count: sections.action.length },
            { key: "upcoming", label: "Aankomend", count: sections.upcoming.length },
            { key: "history", label: "Geschiedenis", count: sections.history.length },
          ].map((item) => {
            const active = activeSection === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setActiveSection(item.key as CustomerSectionKey)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{item.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {hasFocusedBooking ? (
          <View style={styles.focusHint}>
            <Ionicons name="navigate-outline" size={13} color={COLORS.primary} />
            <Text style={styles.focusHintText}>Je bent via melding naar deze afspraak gebracht.</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{sectionTitle(activeSection)}</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>{activeItems.length}</Text>
              </View>
            </View>

            {activeItems.length === 0 ? (
              <View style={styles.stateWrapCompact}>
                <Text style={styles.emptyText}>{sectionEmptyText(activeSection)}</Text>
              </View>
            ) : (
              <View style={styles.bookingList}>{activeItems.map((item) => renderBookingCard(item))}</View>
            )}
          </View>
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
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 26,
    gap: 10,
  },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
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
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 7,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
  },
  filterChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  filterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  filterCountActive: {
    borderColor: "rgba(255,255,255,0.65)",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  filterCountText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  filterCountTextActive: {
    color: "#fff",
  },
  focusHint: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c7ddff",
    backgroundColor: "#edf4ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  focusHintText: {
    flex: 1,
    color: "#2f5fb2",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  sectionCountPill: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  sectionCountText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  bookingList: {
    gap: 8,
  },
  bookingCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 11,
    gap: 6,
  },
  bookingCardFocused: {
    borderColor: COLORS.primary,
    shadowColor: "#204fba",
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bookingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  bookingService: {
    color: COLORS.text,
    fontWeight: "900",
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
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
    marginTop: 2,
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
  payBtn: {
    marginTop: 2,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#d86cb0",
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  payBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  paymentInfoCard: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#d7e4ff",
    backgroundColor: "#f3f7ff",
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  paymentInfoText: {
    flex: 1,
    color: "#3e5b9a",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  cancelBtn: {
    marginTop: 2,
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
  proposalNoteCard: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#d3def8",
    backgroundColor: "#f7faff",
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  proposalNoteText: {
    flex: 1,
    color: "#2d4f96",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  feeText: {
    color: "#af552a",
    fontWeight: "800",
    fontSize: 12,
  },
  stateWrap: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  stateWrapCompact: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});
