import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { getUserRole, logout } from "../../../lib/authRepo";
import { auth, db } from "../../../lib/firebase";
import { subscribeMyCustomerUnreadNotificationsCount } from "../../../lib/notificationRepo";
import { getMyFollowingCount, getMyLikesGivenCount, getMyRatingsGivenCount } from "../../../lib/socialRepo";
import { CATEGORIES, COLORS } from "../../../lib/ui";

type ProfileStats = {
  following: number;
  likesGiven: number;
  ratingsGiven: number;
};

function formatJoined(createdAt: unknown): string {
  const maybeTimestamp = createdAt as { toDate?: () => Date } | undefined;
  const date = maybeTimestamp?.toDate?.();
  if (!date) return "Onbekend";
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function CustomerProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [role, setRole] = useState<string>("customer");
  const [joinedLabel, setJoinedLabel] = useState<string>("Onbekend");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProfileStats>({
    following: 0,
    likesGiven: 0,
    ratingsGiven: 0,
  });
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>(["Nagels", "Wimpers"]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const displayName = useMemo(() => {
    if (!user?.email) return "Beauty Lover";
    const local = user.email.split("@")[0] || "beauty";
    return local.charAt(0).toUpperCase() + local.slice(1);
  }, [user?.email]);

  const initials = useMemo(() => {
    const trimmed = displayName.trim();
    if (!trimmed) return "B";
    return trimmed.slice(0, 2).toUpperCase();
  }, [displayName]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    Promise.all([
      getUserRole(uid),
      getDoc(doc(db, "users", uid)),
      getMyFollowingCount(uid),
      getMyLikesGivenCount(uid),
      getMyRatingsGivenCount(uid),
    ])
      .then(([resolvedRole, userSnap, following, likesGiven, ratingsGiven]) => {
        if (!mounted) return;
        if (resolvedRole) setRole(resolvedRole);
        setJoinedLabel(formatJoined(userSnap.data()?.createdAt));
        setStats({
          following,
          likesGiven,
          ratingsGiven,
        });
      })
      .catch(() => {
        if (!mounted) return;
        setStats({ following: 0, likesGiven: 0, ratingsGiven: 0 });
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setUnreadNotifications(0);
      return;
    }
    return subscribeMyCustomerUnreadNotificationsCount(
      uid,
      (count) => setUnreadNotifications(count),
      () => setUnreadNotifications(0)
    );
  }, [user?.uid]);

  function toggleCategory(category: string) {
    setFavoriteCategories((prev) =>
      prev.includes(category) ? prev.filter((x) => x !== category) : [...prev, category]
    );
  }

  async function onLogout() {
    try {
      await logout();
      router.replace("/(auth)/login" as never);
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon niet uitloggen.");
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#ef4e82", "#d33371"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleWrap}>
              <Ionicons name="person-circle-outline" size={17} color="#fff" />
              <Text style={styles.heroTitle}>Jouw profiel</Text>
            </View>
            <Pressable style={styles.settingsBtn} onPress={() => router.push("/(customer)/notifications" as never)}>
              <Ionicons name="notifications-outline" size={16} color="#fff" />
              {unreadNotifications ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.heroIdentity}>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.subTitle}>{user?.email ?? "Geen e-mail"}</Text>
              <View style={styles.metaPills}>
                <View style={styles.metaPill}>
                  <Ionicons name="pricetag-outline" size={11} color="#fff" />
                  <Text style={styles.metaPillText}>{role}</Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="calendar-outline" size={11} color="#fff" />
                  <Text style={styles.metaPillText}>{joinedLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Ionicons name="people-outline" size={15} color={COLORS.primary} />
            <Text style={styles.metricValue}>{loading ? "-" : stats.following}</Text>
            <Text style={styles.metricLabel}>Volgt</Text>
          </View>
          <View style={styles.metricCard}>
            <Ionicons name="heart-outline" size={15} color={COLORS.primary} />
            <Text style={styles.metricValue}>{loading ? "-" : stats.likesGiven}</Text>
            <Text style={styles.metricLabel}>Likes gegeven</Text>
          </View>
          <View style={styles.metricCard}>
            <Ionicons name="star-outline" size={15} color={COLORS.primary} />
            <Text style={styles.metricValue}>{loading ? "-" : stats.ratingsGiven}</Text>
            <Text style={styles.metricLabel}>Reviews</Text>
          </View>
        </View>

        <View style={styles.quickCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash-outline" size={15} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Snelle acties</Text>
          </View>
          <View style={styles.quickGrid}>
            <Pressable style={styles.quickBtn} onPress={() => router.push("/(customer)/(tabs)" as never)}>
              <Ionicons name="search-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Discover</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => router.push("/(customer)/(tabs)/feed" as never)}>
              <Ionicons name="play-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Feed</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => router.push("/(customer)/(tabs)/bookings" as never)}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Bookings</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => router.push("/(customer)/notifications" as never)}>
              <Ionicons name="notifications-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Meldingen {unreadNotifications ? `(${unreadNotifications})` : ""}</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => router.push("/(customer)/support" as never)}>
              <Ionicons name="help-circle-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Vragen aan team</Text>
            </Pressable>
            {role === "influencer" ? (
              <Pressable style={styles.quickBtn} onPress={() => router.push("/(customer)/influencer/studio" as never)}>
                <Ionicons name="megaphone-outline" size={16} color={COLORS.primary} />
                <Text style={styles.quickText}>Influencer studio</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="pricetags-outline" size={15} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Favoriete categorieen</Text>
          </View>
          <View style={styles.prefWrap}>
            {CATEGORIES.map((category) => {
              const selected = favoriteCategories.includes(category);
              return (
                <Pressable
                  key={category}
                  onPress={() => toggleCategory(category)}
                  style={[styles.prefChip, selected && styles.prefChipActive]}
                >
                  <Text style={[styles.prefText, selected && styles.prefTextActive]}>{category}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={15} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <View style={styles.accountMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Rol</Text>
                <Text style={styles.metaValue}>{role}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Lid sinds</Text>
                <Text style={styles.metaValue}>{joinedLabel}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>E-mail</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {user?.email ?? "-"}
                </Text>
              </View>
            </View>
          )}
        </View>

        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={16} color="#fff" />
          <Text style={styles.logoutText}>Uitloggen</Text>
        </Pressable>
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
    padding: 14,
    gap: 10,
    paddingBottom: 30,
  },
  hero: {
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    gap: 12,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 20,
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(239,78,130,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: "900",
  },
  heroBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  heroIdentity: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 20,
  },
  subTitle: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "700",
    fontSize: 12,
  },
  metaPills: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  metricValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
  },
  metricLabel: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 11,
    textAlign: "center",
  },
  quickCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickBtn: {
    width: "48%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingVertical: 11,
  },
  quickText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  prefWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  prefChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  prefChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  prefText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  prefTextActive: {
    color: "#fff",
  },
  loadingRow: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  accountMeta: {
    gap: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  metaLabel: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#cb3a83",
  },
  logoutText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
});
