import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";
import {
  confirmBookingCheckInByCustomer,
  rejectBookingCheckInByCustomer,
} from "../lib/bookingRepo";
import { auth, db } from "../lib/firebase";
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
  const params = useLocalSearchParams<{ bookingId?: string | string[]; code?: string | string[] }>();
  const uid = String(auth.currentUser?.uid || "").trim();

  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw)) return String(raw[0] || "").trim();
    return "";
  }, [params.bookingId]);
  const code = useMemo(() => {
    const raw = params.code;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw)) return String(raw[0] || "").trim();
    return "";
  }, [params.code]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<BookingLite | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [checkedInDone, setCheckedInDone] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      setBooking(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "bookings", bookingId),
      (snap) => {
        if (!snap.exists()) {
          setBooking(null);
          setLoading(false);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        setBooking({
          id: snap.id,
          companyName: String(data.companyName ?? "").trim(),
          serviceName: String(data.serviceName ?? "").trim(),
          status: parseStatus(data.status),
        });
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsub;
  }, [bookingId]);

  useEffect(() => {
    if (!checkedInDone) return;
    const timeout = setTimeout(() => {
      router.replace(`/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}` as never);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [bookingId, checkedInDone, router]);

  async function onConfirmArrival() {
    if (!uid || !bookingId || !code || submitting) return;
    setSubmitting(true);
    try {
      await confirmBookingCheckInByCustomer({ bookingId, customerId: uid, code });
      setCheckedInDone(true);
    } catch (error: any) {
      Alert.alert("Check-in mislukt", error?.message ?? "Kon aankomst niet bevestigen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRejectArrival() {
    if (!uid || !bookingId || !code || submitting) return;
    if (rejectReason.trim().length < 3) {
      Alert.alert("Reden nodig", "Vul een korte reden in om te weigeren.");
      return;
    }
    setSubmitting(true);
    try {
      await rejectBookingCheckInByCustomer({
        bookingId,
        customerId: uid,
        code,
        reason: rejectReason.trim(),
      });
      Alert.alert("Gemeld", "Je weigering is veilig doorgestuurd naar het admin team.");
      router.replace(`/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}` as never);
    } catch (error: any) {
      Alert.alert("Melding mislukt", error?.message ?? "Kon weigering niet versturen.");
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
            <Text style={styles.errorText}>Boeking niet gevonden of niet meer beschikbaar.</Text>
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

                <TextInput
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Weiger reden (verplicht bij weigeren)"
                  placeholderTextColor="#5f5f5f"
                  style={styles.input}
                  multiline
                />
                <Pressable
                  style={[styles.secondaryBtn, submitting && styles.disabled]}
                  onPress={() => onRejectArrival().catch(() => null)}
                  disabled={submitting}
                >
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
                  <Text style={styles.secondaryBtnText}>Weiger</Text>
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
  input: {
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#f8f8fb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    textAlignVertical: "top",
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
