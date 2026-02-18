import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CompanyNotification,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeMyCompanyNotifications,
} from "../../lib/notificationRepo";
import { auth } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

function typeIcon(type: CompanyNotification["type"]): keyof typeof Ionicons.glyphMap {
  if (type === "new_follower") return "people-outline";
  if (type === "booking_request") return "calendar-outline";
  if (type === "service_rating" || type === "company_rating") return "star-outline";
  if (type === "comment_like") return "chatbubble-outline";
  return "heart-outline";
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

export default function CompanyNotificationsScreen() {
  const uid = auth.currentUser?.uid ?? null;
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [items, setItems] = useState<CompanyNotification[]>([]);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const unsub = subscribeMyCompanyNotifications(
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

  async function onMarkOne(item: CompanyNotification) {
    if (!uid || item.read) return;
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
    await markNotificationRead(uid, item.id).catch(() => null);
  }

  async function onMarkAll() {
    if (!uid || !unreadCount || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(uid);
      setItems((prev) => prev.map((row) => ({ ...row, read: true })));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
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
          renderItem={({ item }) => (
            <Pressable onPress={() => onMarkOne(item)} style={[styles.card, !item.read && styles.cardUnread]}>
              <View style={styles.cardIcon}>
                <Ionicons name={typeIcon(item.type)} size={16} color={COLORS.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardText}>{item.body}</Text>
                <Text style={styles.cardWhen}>{formatWhen(item.updatedAtMs || item.createdAtMs)}</Text>
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
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
    backgroundColor: "#fff3f9",
    borderColor: "#f0c1d8",
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
