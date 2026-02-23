import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCompanyFollowersCount } from "../../../lib/socialRepo";
import {
  BOOKBEAUTY_COMPANY_ID,
  ensureBookBeautyProfileForAdmin,
  fetchBookBeautyProfile,
  updateBookBeautyProfile,
} from "../../../lib/platformRepo";
import { COLORS } from "../../../lib/ui";

export default function AdminPlatformProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [badge, setBadge] = useState("Official");
  const [followersCount, setFollowersCount] = useState(0);

  async function load() {
    setLoading(true);
    try {
      await ensureBookBeautyProfileForAdmin();
      const [profile, followers] = await Promise.all([
        fetchBookBeautyProfile(),
        getCompanyFollowersCount(BOOKBEAUTY_COMPANY_ID),
      ]);
      setName(profile.name || "BookBeauty Team");
      setCity(profile.city || "Nederland");
      setBio(profile.bio || "");
      setLogoUrl(profile.logoUrl || "");
      setCoverImageUrl(profile.coverImageUrl || "");
      setBadge(profile.badge || "Official");
      setFollowersCount(followers);
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon platform profiel niet laden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
  }, []);

  async function onSave() {
    if (saving) return;
    setSaving(true);
    try {
      await updateBookBeautyProfile({
        name: name.trim() || "BookBeauty Team",
        city: city.trim() || "Nederland",
        bio: bio.trim(),
        logoUrl: logoUrl.trim(),
        coverImageUrl: coverImageUrl.trim(),
        badge: badge.trim() || "Official",
      });
      Alert.alert("Opgeslagen", "Platform profiel bijgewerkt.");
      await load();
    } catch (error: any) {
      Alert.alert("Opslaan mislukt", error?.message ?? "Kon wijzigingen niet opslaan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Ionicons name="sparkles-outline" size={18} color={COLORS.primary} />
          <Text style={styles.title}>BookBeauty Profiel</Text>
        </View>
        <Text style={styles.subtitle}>Iedere nieuwe gebruiker volgt dit profiel automatisch.</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loading ? "-" : followersCount}</Text>
            <Text style={styles.statLabel}>Volgers</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>Actief</Text>
            <Text style={styles.statLabel}>Auto-follow</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Profielnaam"
                placeholderTextColor={COLORS.placeholder}
              />
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="Locatie"
                placeholderTextColor={COLORS.placeholder}
              />
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="Bio"
                placeholderTextColor={COLORS.placeholder}
                multiline
              />
              <TextInput
                style={styles.input}
                value={logoUrl}
                onChangeText={setLogoUrl}
                placeholder="Logo URL"
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={coverImageUrl}
                onChangeText={setCoverImageUrl}
                placeholder="Cover URL"
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={badge}
                onChangeText={setBadge}
                placeholder="Badge"
                placeholderTextColor={COLORS.placeholder}
              />
              <View style={styles.actionsRow}>
                <Pressable style={[styles.btn, styles.secondaryBtn]} onPress={() => load()}>
                  <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.secondaryBtnText}>Vernieuwen</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.primaryBtn, saving && styles.disabled]} onPress={onSave}>
                  <Ionicons name="save-outline" size={14} color="#fff" />
                  <Text style={styles.primaryBtnText}>{saving ? "Opslaan..." : "Opslaan"}</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.openProfileBtn}
                onPress={() => router.push(`/(customer)/company/${BOOKBEAUTY_COMPANY_ID}` as never)}
              >
                <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
                <Text style={styles.openProfileText}>Open publiek profiel</Text>
              </Pressable>
            </>
          )}
        </View>
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
    paddingBottom: 26,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.muted,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 2,
  },
  statValue: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 18,
  },
  statLabel: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  formCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 8,
  },
  loadingWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
  },
  bioInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
  secondaryBtn: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  openProfileBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  openProfileText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  disabled: {
    opacity: 0.6,
  },
});
