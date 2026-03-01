import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { fetchCustomerBookings, type Booking } from "../lib/bookingRepo";
import { auth } from "../lib/firebase";
import { COLORS } from "../lib/ui";

function formatDateTime(row: Booking): string {
  const date = row.startAtMs ? new Date(row.startAtMs) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return row.bookingDate || "Onbekend moment";
  }
  return date.toLocaleString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountBookingsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchCustomerBookings(uid)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MarketplaceShell scroll={false}>
      <MarketplaceSeo
        title="Mijn boekingen | BookBeauty"
        description="Bekijk je aankomende en eerdere BookBeauty afspraken."
        pathname="/account-bookings"
      />

      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>Mijn boekingen</Text>
        <Text style={styles.title}>Alle afspraken in dezelfde marketplace-stijl.</Text>
        <Text style={styles.subtitle}>
          Je hoeft niet terug naar de oude appweergave. Hier zie je je lopende aanvragen en hun status.
        </Text>

        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Boekingen laden...</Text>
          </View>
        ) : !auth.currentUser?.uid ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nog niet ingelogd</Text>
            <Text style={styles.emptyText}>Log in om je accountboekingen te beheren.</Text>
            <Pressable onPress={() => router.push("/(auth)/login" as never)} style={styles.inlineButton}>
              <Text style={styles.inlineButtonText}>Inloggen</Text>
            </Pressable>
          </View>
        ) : items.length ? (
          <View style={styles.list}>
            {items.map((row) => (
              <View key={row.id} style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.company}>{row.companyName}</Text>
                  <Text style={styles.meta}>{row.serviceName}</Text>
                  <Text style={styles.meta}>{formatDateTime(row)}</Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{row.status}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nog geen accountboekingen</Text>
            <Text style={styles.emptyText}>
              Gastboekingen blijven zichtbaar via de statuspagina. Nieuwe accountboekingen verschijnen hier automatisch.
            </Text>
            <Pressable onPress={() => router.push("/discover" as never)} style={styles.inlineButton}>
              <Text style={styles.inlineButtonText}>Ontdek salons</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 760,
  },
  list: {
    marginTop: 8,
    gap: 12,
  },
  row: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  company: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  statusPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  emptyCard: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  inlineButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
});
