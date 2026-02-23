import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CustomerNotification,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
  subscribeMyCustomerNotifications,
} from "../../lib/notificationRepo";
import { auth } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

function typeIcon(type: CustomerNotification["type"]): keyof typeof Ionicons.glyphMap {
  if (type === "booking_confirmed") return "checkmark-circle-outline";
  if (type === "booking_declined") return "close-circle-outline";
  if (type === "booking_time_proposed") return "time-outline";
  if (type === "booking_reschedule_approved") return "swap-horizontal-outline";
  if (type === "booking_reschedule_declined") return "close-outline";
  return "calendar-outline";
}

function formatWhen(timestampMs: number): string {
  if (!timestampMs) return "nu";
  return new Date(timestampMs).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isBookingNotification(type: CustomerNotification["type"]): boolean {
  return (
    type === "booking_created" ||
    type === "booking_confirmed" ||
    type === "booking_declined" ||
    type === "booking_time_proposed" ||
    type === "booking_reschedule_approved" ||
    type === "booking_reschedule_declined"
  );
}

function routeForNotification(item: CustomerNotification): string | null {
  if (!isBookingNotification(item.type)) return null;
  if (item.bookingId) return `/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(item.bookingId)}`;
  return "/(customer)/(tabs)/bookings";
}

export default function CustomerNotificationsScreen() {
  const uid = auth.currentUser?.uid ?? null;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [items, setItems] = useState<CustomerNotification[]>([]);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const unsub = subscribeMyCustomerNotifications(
      uid,
      (rows) => {
        setItems(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [uid]);

  const unreadCount = items.filter((item) => !item.read).length;

  async function onOpenNotification(item: CustomerNotification) {
    if (!uid) return;
    if (!item.read) {
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
      await markCustomerNotificationRead(uid, item.id).catch(() => null);
    }

    const nextRoute = routeForNotification(item);
    if (nextRoute) {
      router.push(nextRoute as never);
    }
  }

  async function onMarkAll() {
    if (!uid || !unreadCount || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllCustomerNotificationsRead(uid);
      setItems((prev) => prev.map((row) => ({ ...row, read: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
          <Text style={styles.backText}>Terug</Text>
        </Pressable>
        <Pressable
          onPress={onMarkAll}
          disabled={!unreadCount || markingAll}
          style={[styles.readAllBtn, (!unreadCount || markingAll) && styles.disabled]}
        >
          <Ionicons name="checkmark-done-outline" size={14} color={COLORS.primary} />
          <Text style={styles.readAllText}>{markingAll ? "Bezig..." : "Alles gelezen"}</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Ionicons name="notifications-outline" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Meldingen</Text>
      </View>
      <Text style={styles.subtitle}>{unreadCount} ongelezen</Text>

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
            const bookingRoute = routeForNotification(item);
            return (
              <Pressable onPress={() => onOpenNotification(item)} style={[styles.card, !item.read && styles.cardUnread]}>
                <View style={styles.cardIcon}>
                  <Ionicons name={typeIcon(item.type)} size={16} color={COLORS.primary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardText}>{item.body}</Text>
                  <Text style={styles.cardWhen}>{formatWhen(item.updatedAtMs || item.createdAtMs)}</Text>
                </View>
                {bookingRoute ? (
                  <Ionicons name="chevron-forward-outline" size={16} color={COLORS.primary} style={styles.cardChevron} />
                ) : null}
                {!item.read ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.stateWrap}>
              <Text style={styles.emptyText}>Nog geen meldingen.</Text>
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
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  backText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  readAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  readAllText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.muted,
    fontWeight: "700",
    marginBottom: 2,
  },
  stateWrap: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: 8,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardUnread: {
    backgroundColor: "#fff6fb",
    borderColor: "#f0cfe0",
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  cardWhen: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  cardChevron: {
    marginTop: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 5,
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.45,
  },
});
