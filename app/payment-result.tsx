import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getUserRole } from "../lib/authRepo";
import { auth, db } from "../lib/firebase";
import { COLORS } from "../lib/ui";

type PaymentResultState = "processing" | "paid" | "failed" | "canceled" | "expired";

type BookingSnapshot = {
  id: string;
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceName: string;
  customerName: string;
  bookingDate: string;
  startAtMs: number;
  bookingStatus: string;
  paymentStatus: string;
  mollieStatus: string;
};

function toLower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
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

function formatDateTime(startAtMs: number): string {
  if (!startAtMs) return "-";
  return new Date(startAtMs).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseBookingData(bookingId: string, raw: Record<string, unknown>): BookingSnapshot {
  const mollieNode = (raw.mollie as Record<string, unknown> | undefined) ?? {};
  return {
    id: bookingId,
    companyId: String(raw.companyId ?? "").trim(),
    companyName: String(raw.companyName ?? "").trim(),
    serviceId: String(raw.serviceId ?? "").trim(),
    serviceName: String(raw.serviceName ?? "").trim(),
    customerName: String(raw.customerName ?? "").trim(),
    bookingDate: String(raw.bookingDate ?? "").trim(),
    startAtMs: toMillis(raw.startAt) || toMillis(raw.startAtMs),
    bookingStatus: toLower(raw.status),
    paymentStatus: toLower(raw.paymentStatus),
    mollieStatus: toLower(mollieNode.status),
  };
}

function mapState(booking: BookingSnapshot | null): PaymentResultState {
  if (!booking) return "processing";

  if (booking.paymentStatus === "paid" || booking.mollieStatus === "paid") return "paid";
  if (
    booking.paymentStatus === "canceled" ||
    booking.paymentStatus === "cancelled" ||
    booking.mollieStatus === "canceled" ||
    booking.mollieStatus === "cancelled" ||
    booking.bookingStatus === "cancelled_by_customer"
  ) {
    return "canceled";
  }
  if (booking.paymentStatus === "expired" || booking.mollieStatus === "expired") return "expired";
  if (booking.mollieStatus === "failed" || booking.paymentStatus === "failed") return "failed";
  return "processing";
}

function stateText(state: PaymentResultState): { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap } {
  if (state === "paid") {
    return {
      title: "Betaling gelukt",
      subtitle: "Dankjewel, je afspraak is bevestigd en veilig betaald.",
      icon: "checkmark-done-circle",
    };
  }
  if (state === "failed") {
    return {
      title: "Betaling mislukt",
      subtitle: "Je betaling kon niet worden afgerond. Probeer het opnieuw.",
      icon: "close-circle",
    };
  }
  if (state === "canceled") {
    return {
      title: "Betaling geannuleerd",
      subtitle: "De betaling is geannuleerd. Je kunt opnieuw proberen wanneer je wilt.",
      icon: "remove-circle",
    };
  }
  if (state === "expired") {
    return {
      title: "Betaling verlopen",
      subtitle: "De betaallink is verlopen. Start de betaling opnieuw vanuit je boeking.",
      icon: "time",
    };
  }
  return {
    title: "Betaling wordt verwerkt…",
    subtitle: "Even geduld. We verwerken je betaling en werken je boeking live bij.",
    icon: "sync-circle",
  };
}

function iconColor(state: PaymentResultState): string {
  if (state === "paid") return "#1f9a5f";
  if (state === "processing") return "#2f6dff";
  return "#cc3f59";
}

export default function PaymentResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingSnapshot | null>(null);
  const [companyLocation, setCompanyLocation] = useState("");

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw) && raw.length) return String(raw[0] || "").trim();
    return "";
  }, [params.bookingId]);

  const state = mapState(booking);
  const copy = stateText(state);

  const openBookings = useCallback(async () => {
    const uid = String(auth.currentUser?.uid || "").trim();
    if (!uid) {
      router.replace("/(auth)/login" as never);
      return;
    }

    const role = await getUserRole(uid).catch(() => "customer");
    if (role === "company" || role === "employee") {
      router.replace("/(company)/(tabs)/bookings" as never);
      return;
    }
    router.replace("/(customer)/(tabs)/bookings" as never);
  }, [router]);

  const retryPayment = useCallback(async () => {
    if (!booking?.companyId || !booking?.serviceId) {
      await openBookings();
      return;
    }
    router.replace(`/(customer)/book/${booking.companyId}/${booking.serviceId}` as never);
  }, [booking?.companyId, booking?.serviceId, openBookings, router]);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      setBooking(null);
      return;
    }

    let unsub: Unsubscribe | null = null;
    setLoading(true);

    unsub = onSnapshot(
      doc(db, "bookings", bookingId),
      (snap) => {
        if (!snap.exists()) {
          setBooking(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as Record<string, unknown>;
        setBooking(parseBookingData(bookingId, data));
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [bookingId]);

  useEffect(() => {
    const companyId = String(booking?.companyId || "").trim();
    if (!companyId) {
      setCompanyLocation("");
      return;
    }

    getDoc(doc(db, "companies_public", companyId))
      .then((snap) => {
        if (!snap.exists()) {
          setCompanyLocation("");
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const city = String(data.city ?? "").trim();
        const address = String(data.address ?? data.street ?? "").trim();
        setCompanyLocation([address, city].filter(Boolean).join(" • "));
      })
      .catch(() => setCompanyLocation(""));
  }, [booking?.companyId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#0f1026", "#1c1d44", "#df4f9a"]} style={styles.hero}>
          <View style={styles.heroIconWrap}>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Ionicons name={copy.icon} size={72} color={iconColor(state)} />
            )}
          </View>
          <Text style={styles.heroTitle}>{copy.title}</Text>
          <Text style={styles.heroSubtitle}>{copy.subtitle}</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Boeking details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Salon</Text>
            <Text style={styles.detailValue}>{booking?.companyName || "-"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Adres</Text>
            <Text style={styles.detailValue}>{companyLocation || "-"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Dienst</Text>
            <Text style={styles.detailValue}>{booking?.serviceName || "-"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Datum & tijd</Text>
            <Text style={styles.detailValue}>{formatDateTime(booking?.startAtMs || 0)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <Text style={styles.detailValue}>
              {booking?.mollieStatus || booking?.paymentStatus || "pending"}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={() => openBookings().catch(() => null)}>
            <Ionicons name="calendar-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Bekijk mijn boekingen</Text>
          </Pressable>

          {(state === "failed" || state === "canceled" || state === "expired") && (
            <Pressable style={styles.secondaryBtn} onPress={() => retryPayment().catch(() => null)}>
              <Ionicons name="refresh-outline" size={16} color={COLORS.primary} />
              <Text style={styles.secondaryBtnText}>Probeer opnieuw</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f4f7",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  hero: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 24,
    marginTop: 8,
    alignItems: "center",
    gap: 10,
  },
  heroIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 560,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 14,
    gap: 9,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 3,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0e7ed",
    paddingTop: 9,
  },
  detailLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  detailValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
  },
  actions: {
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryBtn: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "900",
  },
});
