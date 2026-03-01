import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import SkeletonBlock from "../components/SkeletonBlock";
import {
  PublicBookingStatus,
  subscribePublicBookingStatus,
} from "../lib/publicBookingRepo";
import { COLORS } from "../lib/ui";

function statusLabel(value: string): string {
  if (value === "confirmed") return "Bevestigd";
  if (value === "cancelled") return "Afgewezen";
  if (value === "reschedule_requested") return "Nieuw voorstel";
  return "Aangevraagd";
}

export default function BookingStatusScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; email?: string }>();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";
  const email = typeof params.email === "string" ? params.email : "";
  const [status, setStatus] = useState<PublicBookingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId || !email) {
      setLoading(false);
      return;
    }

    const unsub = subscribePublicBookingStatus(
      bookingId,
      email,
      (value) => {
        setStatus(value);
        setLoading(false);
      },
      () => {
        setStatus(null);
        setLoading(false);
      }
    );

    return unsub;
  }, [bookingId, email]);

  const pathname = useMemo(() => "/booking-status", []);

  return (
    <MarketplaceShell>
      <MarketplaceSeo
        title="Boekingsstatus | BookBeauty"
        description="Bekijk de status van je BookBeauty aanvraag."
        pathname={pathname}
      />

      <View style={styles.card}>
        <Text style={styles.kicker}>Booking status</Text>
        <Text style={styles.title}>Bekijk je aanvraag</Text>
        <Text style={styles.subtitle}>
          Deze pagina vernieuwt automatisch zodra de salon je aanvraag accepteert, afwijst of een nieuw tijdstip voorstelt.
        </Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <SkeletonBlock height={24} width="44%" radius={10} />
            <SkeletonBlock height={18} width="72%" radius={10} />
            <SkeletonBlock height={18} width="56%" radius={10} />
          </View>
        ) : !status ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Geen aanvraag gevonden</Text>
            <Text style={styles.statusText}>
              Controleer je link of gebruik hetzelfde e-mailadres waarmee je de boekingsaanvraag hebt verstuurd.
            </Text>
          </View>
        ) : (
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>{statusLabel(status.status)}</Text>
            <Text style={styles.statusTitle}>{status.companyName}</Text>
            <Text style={styles.statusText}>{status.serviceName}</Text>
            <Text style={styles.statusMeta}>
              {status.requestedDate} om {status.requestedTime}
            </Text>
          </View>
        )}
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    gap: 10,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 32,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 720,
  },
  loadingWrap: {
    marginTop: 6,
    gap: 10,
  },
  statusCard: {
    marginTop: 6,
    padding: 18,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  statusLabel: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  statusTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 22,
  },
  statusText: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  statusMeta: {
    color: COLORS.text,
    fontWeight: "700",
    marginTop: 4,
  },
});
