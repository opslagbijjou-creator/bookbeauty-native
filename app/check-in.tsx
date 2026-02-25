import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/ui";

type BookingLite = {
  id: string;
  companyName: string;
  serviceName: string;
  status: string;
};

function parseStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export default function CheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    bookingId?: string | string[];
    id?: string | string[];
    code?: string | string[];
    checkInCode?: string | string[];
  }>();
  const bookingId = useMemo(() => {
    const raw = params.bookingId ?? params.id;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw)) return String(raw[0] || "").trim();
    return "";
  }, [params.bookingId, params.id]);
  const code = useMemo(() => {
    const raw = params.code ?? params.checkInCode;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw)) return String(raw[0] || "").trim();
    return "";
  }, [params.code, params.checkInCode]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<BookingLite | null>(null);
  const [loadError, setLoadError] = useState("");
  const [checkedInDone, setCheckedInDone] = useState(false);

  const functionBaseUrl = useMemo(() => {
    const raw = String(process.env.EXPO_PUBLIC_APP_BASE_URL || "https://www.bookbeauty.nl").trim();
    return raw.replace(/\/+$/, "");
  }, []);

  const checkInEndpoint = useMemo(() => {
    return Platform.OS === "web"
      ? "/.netlify/functions/booking-checkin"
      : `${functionBaseUrl}/.netlify/functions/booking-checkin`;
  }, [functionBaseUrl]);

  const callCheckInApi = useCallback(async (
    action: "preview" | "confirm"
  ): Promise<{ ok: boolean; error?: string; booking?: BookingLite; alreadyCheckedIn?: boolean }> => {
    const response = await fetch(checkInEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        bookingId,
        code,
      }),
    }).catch(() => null);

    if (!response) return { ok: false, error: "Geen verbinding met check-in server." };
    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok || payload.ok !== true) {
      return {
        ok: false,
        error: String(payload.error || "").trim() || "Check-in mislukt.",
      };
    }

    const bookingNode = payload.booking as Record<string, unknown> | undefined;
    const bookingParsed = bookingNode
      ? {
          id: String(bookingNode.id || bookingId).trim(),
          companyName: String(bookingNode.companyName || "").trim(),
          serviceName: String(bookingNode.serviceName || "").trim(),
          status: parseStatus(bookingNode.status),
        }
      : undefined;

    return {
      ok: true,
      booking: bookingParsed,
      alreadyCheckedIn: Boolean(payload.alreadyCheckedIn || payload.checkedIn),
    };
  }, [bookingId, checkInEndpoint, code]);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      setBooking(null);
      setLoadError("Geen bookingId gevonden in de QR-link.");
      return;
    }
    if (!code) {
      setLoading(false);
      setBooking(null);
      setLoadError("Geen check-in code gevonden in de QR-link.");
      return;
    }

    let cancelled = false;
    setLoadError("");
    setLoading(true);

    callCheckInApi("preview")
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setBooking(null);
          setLoadError(result.error || "Kon deze booking niet openen. Probeer opnieuw.");
          setLoading(false);
          return;
        }
        if (result.booking) {
          setBooking(result.booking);
        }
        setCheckedInDone(Boolean(result.alreadyCheckedIn || result.booking?.status === "checked_in"));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBooking(null);
        setLoadError("Kon deze booking niet openen. Probeer opnieuw.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId, code, checkInEndpoint, callCheckInApi]);

  useEffect(() => {
    if (!checkedInDone) return;
    const timeout = setTimeout(() => {
      router.replace(`/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}` as never);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [bookingId, checkedInDone, router]);

  async function onConfirmArrival() {
    if (!bookingId || !code || submitting) return;
    setSubmitting(true);
    try {
      const result = await callCheckInApi("confirm");
      if (!result.ok) {
        throw new Error(result.error || "Kon aankomst niet bevestigen.");
      }
      if (result.booking) {
        setBooking(result.booking);
      }
      setCheckedInDone(true);
    } catch (error: any) {
      Alert.alert("Check-in mislukt", error?.message ?? "Kon aankomst niet bevestigen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.content}>
        <View style={styles.headerCard}>
          <Ionicons
            name={checkedInDone ? "checkmark-circle" : "qr-code-outline"}
            size={58}
            color={checkedInDone ? "#1f9a5f" : COLORS.primary}
          />
          <Text style={styles.title}>{checkedInDone ? "Aankomst bevestigd" : "Bevestig je aankomst"}</Text>
          <Text style={styles.subtitle}>
            {checkedInDone
              ? "Top, je check-in is verwerkt."
              : "Scan en bevestig zodat je afspraak direct als aanwezig wordt geregistreerd."}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : !booking ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{loadError || "Boeking niet gevonden of niet meer beschikbaar."}</Text>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => router.replace("/(customer)/(tabs)/bookings" as never)}
            >
              <Ionicons name="calendar-outline" size={16} color={COLORS.danger} />
              <Text style={styles.secondaryBtnText}>Naar mijn boekingen</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.metaTitle}>{booking.serviceName || "Afspraak"}</Text>
            <Text style={styles.metaText}>{booking.companyName || "Salon"}</Text>
            <Text style={styles.metaText}>Status: {booking.status || "-"}</Text>

            {!checkedInDone ? (
              <>
                <Pressable
                  style={[styles.primaryBtn, submitting && styles.disabled]}
                  onPress={() => onConfirmArrival().catch(() => null)}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.primaryBtnText}>Bevestig aankomst</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7fb",
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  headerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  loaderWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 14,
    gap: 10,
  },
  metaTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryBtn: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f2ccd6",
    backgroundColor: "#fff2f5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryBtnText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.55,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "700",
  },
});
