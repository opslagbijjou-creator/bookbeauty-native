import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryChips from "../../../components/CategoryChips";
import { logout } from "../../../lib/authRepo";
import { ensureCompanyDoc } from "../../../lib/companyActions";
import { auth, db } from "../../../lib/firebase";
import { captureImageWithCamera, pickImageFromLibrary, uploadUriToStorage } from "../../../lib/mediaRepo";
import { syncCompanyBrandingInFeed } from "../../../lib/feedRepo";
import { subscribeMyUnreadNotificationsCount } from "../../../lib/notificationRepo";
import { getCompanyFollowersCount, getCompanyProfileRating, getCompanyTotalLikes } from "../../../lib/socialRepo";
import { CATEGORIES, COLORS } from "../../../lib/ui";

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Kapper: "cut-outline",
  Nagels: "flower-outline",
  Wimpers: "eye-outline",
  Wenkbrauwen: "sparkles-outline",
  "Make-up": "color-palette-outline",
  Massage: "body-outline",
  Spa: "water-outline",
  Barber: "man-outline",
  Overig: "grid-outline",
};

export default function CompanyHomeScreen() {
  const uid = auth.currentUser?.uid;
  const router = useRouter();
  const isFocused = useIsFocused();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [kvk, setKvk] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(auth.currentUser?.email ?? "");
  const [logoUrl, setLogoUrl] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [likes, setLikes] = useState(0);
  const [rating, setRating] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [ratingMinReviews, setRatingMinReviews] = useState(10);
  const [unreadCount, setUnreadCount] = useState(0);

  const canSave = useMemo(
    () => name.trim().length >= 2 && city.trim().length >= 2 && categories.length > 0,
    [name, city, categories]
  );
  const profileRatingText = ratingCount >= ratingMinReviews ? rating.toFixed(1) : `${ratingCount}/${ratingMinReviews}`;
  const profileRatingSuffix = ratingCount >= ratingMinReviews ? "score" : "reviews";

  useEffect(() => {
    if (!uid) return;

    let mounted = true;

    ensureCompanyDoc(uid)
      .then(async () => {
        const publicSnap = await getDoc(doc(db, "companies_public", uid));
        const privateSnap = await getDoc(doc(db, "companies", uid));
        const [followersCount, likesTotal, ratingData] = await Promise.all([
          getCompanyFollowersCount(uid),
          getCompanyTotalLikes(uid),
          getCompanyProfileRating(uid),
        ]);

        if (!mounted) return;

        if (publicSnap.exists()) {
          const d = publicSnap.data();
          setName(String(d.name ?? ""));
          setCity(String(d.city ?? ""));
          setBio(String(d.bio ?? ""));
          setLogoUrl(String(d.logoUrl ?? ""));
          setCategories(Array.isArray(d.categories) ? d.categories : []);
        }

        if (privateSnap.exists()) {
          const d = privateSnap.data();
          setKvk(String(d.kvk ?? ""));
          setPhone(String(d.phone ?? ""));
          setEmail(String(d.email ?? auth.currentUser?.email ?? ""));
        }

        setFollowers(followersCount);
        setLikes(likesTotal);
        setRating(ratingData.avg);
        setRatingCount(ratingData.count);
        setRatingMinReviews(ratingData.minReviewCount);
      })
      .catch((error: any) => {
        Alert.alert("Fout", error?.message ?? "Kon bedrijfsprofiel niet laden.");
      });

    return () => {
      mounted = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || !isFocused) return;
    const unsub = subscribeMyUnreadNotificationsCount(uid, setUnreadCount, () => null);
    return unsub;
  }, [uid, isFocused]);

  function toggleCategory(value: string) {
    setCategories((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  async function onPickLogoFromLibrary() {
    const media = await pickImageFromLibrary();
    if (!media || !uid) return;

    try {
      const uploaded = await uploadUriToStorage(
        `companies/${uid}/logos/${Date.now()}-${media.fileName}`,
        media.uri,
        media.mimeType
      );
      setLogoUrl(uploaded);
    } catch (error: any) {
      Alert.alert("Upload mislukt", error?.message ?? "Kon logo niet uploaden.");
    }
  }

  async function onCaptureLogo() {
    const media = await captureImageWithCamera();
    if (!media || !uid) return;

    try {
      const uploaded = await uploadUriToStorage(
        `companies/${uid}/logos/${Date.now()}-${media.fileName}`,
        media.uri,
        media.mimeType
      );
      setLogoUrl(uploaded);
    } catch (error: any) {
      Alert.alert("Upload mislukt", error?.message ?? "Kon logo niet uploaden.");
    }
  }

  async function onSave() {
    if (!uid || !canSave || saving) return;
    setSaving(true);

    try {
      const publicRef = doc(db, "companies_public", uid);
      const privateRef = doc(db, "companies", uid);
      const privateSnap = await getDoc(privateRef);
      const publicSnap = await getDoc(publicRef);
      const existingBadge =
        publicSnap.exists() && typeof publicSnap.data().badge === "string"
          ? String(publicSnap.data().badge)
          : undefined;

      await setDoc(
        publicRef,
        {
          name: name.trim(),
          city: city.trim(),
          categories,
          bio: bio.trim(),
          logoUrl,
          isActive: true,
          ...(existingBadge ? { badge: existingBadge } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        privateRef,
        {
          ownerId: uid,
          kvk: kvk.trim(),
          phone: phone.trim(),
          email: email.trim(),
          ...(privateSnap.exists() ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await syncCompanyBrandingInFeed(uid);

      Alert.alert("Opgeslagen", "Bedrijfsprofiel is bijgewerkt.");
    } catch (error: any) {
      const code = typeof error?.code === "string" ? ` (${error.code})` : "";
      Alert.alert("Fout", `${error?.message ?? "Opslaan is mislukt."}${code}`);
    } finally {
      setSaving(false);
    }
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
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBar}>
          <View style={styles.titleRow}>
            <Ionicons name="business-outline" size={20} color={COLORS.primary} />
            <Text style={styles.title}>Bedrijfsprofiel</Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => router.push("/(company)/notifications" as never)}>
            <Ionicons name="notifications-outline" size={18} color={COLORS.primary} />
            {unreadCount ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <LinearGradient colors={["#f05a9f", "#d83e88"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.logoWrap}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
              ) : (
                <Ionicons name="image-outline" size={26} color="rgba(255,255,255,0.94)" />
              )}
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle}>{name || "Jouw salon"}</Text>
              <Text style={styles.heroSub}>{city || "Stad nog niet ingesteld"}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="people-outline" size={12} color="#fff" />
                  <Text style={styles.statText}>{followers} volgers</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="heart-outline" size={12} color="#fff" />
                  <Text style={styles.statText}>{likes} likes</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="star-outline" size={12} color="#fff" />
                  <Text style={styles.statText}>
                    {profileRatingText} {profileRatingSuffix}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <Text style={styles.heroBio}>{bio || "Voeg een korte bio toe om klanten te overtuigen."}</Text>
        </LinearGradient>

        <View style={styles.studioCard}>
          <View style={styles.studioTitleRow}>
            <Ionicons name="videocam-outline" size={16} color={COLORS.primary} />
            <Text style={styles.studioTitle}>Video upload</Text>
          </View>
          <Text style={styles.studioText}>Upload, wijzig en verwijder je feed video&apos;s vanuit je profiel.</Text>
          <Pressable style={styles.studioBtn} onPress={() => router.push("/(company)/(tabs)/studio" as never)}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.studioBtnText}>Nieuwe video uploaden</Text>
          </Pressable>
        </View>

        <View style={styles.logoActions}>
          <Pressable style={styles.logoBtn} onPress={onPickLogoFromLibrary}>
            <Ionicons name="images-outline" size={14} color={COLORS.primary} />
            <Text style={styles.logoBtnText}>Logo uit galerij</Text>
          </Pressable>
          <Pressable style={styles.logoBtn} onPress={onCaptureLogo}>
            <Ionicons name="camera-outline" size={14} color={COLORS.primary} />
            <Text style={styles.logoBtnText}>Logo met camera</Text>
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.quickBtn} onPress={() => router.push("/(company)/(tabs)/services" as never)}>
            <Ionicons name="cut-outline" size={16} color={COLORS.primary} />
            <Text style={styles.quickText}>Diensten</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => router.push("/(company)/(tabs)/feed" as never)}>
            <Ionicons name="play-outline" size={16} color={COLORS.primary} />
            <Text style={styles.quickText}>Publieke feed</Text>
          </Pressable>
          <Pressable style={styles.quickBtn} onPress={() => router.push("/(company)/notifications" as never)}>
            <Ionicons name="notifications-outline" size={16} color={COLORS.primary} />
            <Text style={styles.quickText}>Meldingen {unreadCount ? `(${unreadCount})` : ""}</Text>
          </Pressable>
          {uid ? (
            <Pressable style={styles.quickBtn} onPress={() => router.push(`/(customer)/company/${uid}` as never)}>
              <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Publiek profiel</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Salonnaam"
            placeholderTextColor={COLORS.placeholder}
          />
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Stad"
            placeholderTextColor={COLORS.placeholder}
          />
          <TextInput
            style={styles.input}
            value={bio}
            onChangeText={setBio}
            placeholder="Bio"
            placeholderTextColor={COLORS.placeholder}
            multiline
          />
          <TextInput
            style={styles.input}
            value={kvk}
            onChangeText={setKvk}
            placeholder="KVK"
            placeholderTextColor={COLORS.placeholder}
          />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Telefoon"
            placeholderTextColor={COLORS.placeholder}
          />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Zakelijk e-mail"
            placeholderTextColor={COLORS.placeholder}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Categorieen (meerdere kiezen)</Text>
          <CategoryChips
            items={[...CATEGORIES]}
            selectedItems={categories}
            multi
            onToggle={toggleCategory}
            iconMap={categoryIcons}
          />

          <Pressable
            style={[styles.primaryBtn, (!canSave || saving) && styles.disabled]}
            onPress={onSave}
            disabled={!canSave || saving}
          >
            <Ionicons name="save-outline" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>{saving ? "Opslaan..." : "Profiel opslaan"}</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={14} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Uitloggen</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 14,
    gap: 10,
    paddingBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    padding: 12,
    gap: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  heroInfo: {
    flex: 1,
    gap: 2,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  heroSub: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "700",
    fontSize: 13,
  },
  heroBio: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  statsRow: {
    marginTop: 5,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  studioCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  studioTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  studioTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  studioText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  studioBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  studioBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  logoActions: {
    flexDirection: "row",
    gap: 8,
  },
  logoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 10,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 8,
  },
  logoBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  quickBtn: {
    flexGrow: 1,
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  quickText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
  },
  label: {
    marginTop: 2,
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  primaryBtn: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
});
