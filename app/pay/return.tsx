import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { getUserRole } from "../../lib/authRepo";
import { auth, db } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

type PaymentUiState = "loading" | "paid" | "failed" | "canceled" | "processing";

const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 90_000;

function isCanceled(value: string): boolean {
  return value === "canceled" || value === "cancelled";
}

export default function PayReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const bookingId = useMemo(() => {
    const raw = params.bookingId;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw) && raw.length) return String(raw[0] || "").trim();
    return "";
  }, [params.bookingId]);

  const [state, setState] = useState<PaymentUiState>("loading");
  const [message, setMessage] = useState("Betaling wordt gecontroleerd...");
  const [busy, setBusy] = useState(true);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!bookingId) {
      setState("failed");
      setBusy(false);
      setMessage("Geen bookingId in return URL.");
      return;
    }

    let stopped = false;
    const startedAt = Date.now();

    const syncStatus = async () => {
      if (stopped) return;

      const snap = await getDoc(doc(db, "bookings", bookingId)).catch(() => null);
      if (!snap?.exists()) {
        setState("failed");
        setBusy(false);
        setMessage("Boeking niet gevonden.");
        stopped = true;
        return;
      }

      const data = snap.data() || {};
      const bookingStatus = String(data.status || "").trim().toLowerCase();
      const paymentStatus = String(data.paymentStatus || "").trim().toLowerCase();
      const mollieStatus = String((data.mollie && data.mollie.status) || "").trim().toLowerCase();

      if (paymentStatus === "paid" || bookingStatus === "paid" || mollieStatus === "paid") {
        setState("paid");
        setBusy(false);
        setMessage("Betaling gelukt. Je wordt doorgestuurd...");
        stopped = true;
        redirectTimerRef.current = setTimeout(() => {
          openBookings().catch(() => null);
        }, 900);
        return;
      }

      if (paymentStatus === "failed" || bookingStatus === "failed" || mollieStatus === "failed") {
        setState("failed");
        setBusy(false);
        setMessage("Betaling is mislukt.");
        stopped = true;
        return;
      }

      if (
        isCanceled(paymentStatus) ||
        isCanceled(bookingStatus) ||
        isCanceled(mollieStatus)
      ) {
        setState("canceled");
        setBusy(false);
        setMessage("Betaling is geannuleerd.");
        stopped = true;
        return;
      }

      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        setState("processing");
        setBusy(false);
        setMessage("Betaling wordt nog verwerkt. Controleer je boekingen over een paar seconden.");
        stopped = true;
      }
    };

    syncStatus().catch(() => null);
    const interval = setInterval(() => {
      syncStatus().catch(() => null);
    }, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(interval);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [bookingId, openBookings]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.card}>
        {busy ? <ActivityIndicator size="large" color={COLORS.primary} /> : null}
        <Text style={styles.title}>
          {state === "paid"
            ? "Betaling gelukt"
            : state === "failed"
              ? "Betaling mislukt"
              : state === "canceled"
                ? "Betaling geannuleerd"
                : "Betaling controleren"}
        </Text>
        <Text style={styles.message}>{message}</Text>

        {!busy ? (
          <Pressable style={styles.btn} onPress={() => openBookings().catch(() => null)}>
            <Text style={styles.btnText}>Naar boekingen</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 20,
    gap: 12,
    alignItems: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    marginTop: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
  },
});
