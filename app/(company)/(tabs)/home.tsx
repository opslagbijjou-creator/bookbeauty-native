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
import { getUserRole, logout } from "../../../lib/authRepo";
import { ensureCompanyDoc } from "../../../lib/companyActions";
import { fetchCompanyById } from "../../../lib/companyRepo";
import { auth, db } from "../../../lib/firebase";
import { captureImageWithCamera, pickImageFromLibrary, uploadUriToStorage } from "../../../lib/mediaRepo";
import { syncCompanyBrandingInFeed } from "../../../lib/feedRepo";
import { subscribeMyUnreadNotificationsCount } from "../../../lib/notificationRepo";
import { getCompanyFollowersCount, getCompanyProfileRating, getCompanyTotalLikes } from "../../../lib/socialRepo";
import {
  addCompanyEmployeeByEmail,
  CompanyStaffMember,
  ensureOwnerBookableStaff,
  fetchCompanyEmployees,
  getEmployeeCompanyId,
  removeCompanyEmployee,
} from "../../../lib/staffRepo";
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
  const [role, setRole] = useState<"company" | "employee">("company");
  const [companyId, setCompanyId] = useState<string | null>(uid ?? null);
  const [ownerId, setOwnerId] = useState("");
  const [companyLabel, setCompanyLabel] = useState("");

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
  const [employees, setEmployees] = useState<CompanyStaffMember[]>([]);
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);

  const canSave = useMemo(
    () => name.trim().length >= 2 && city.trim().length >= 2 && categories.length > 0,
    [name, city, categories]
  );
  const isEmployee = role === "employee";
  const isOwner = !isEmployee && Boolean(uid && companyId && uid === companyId && ownerId === uid);
  const profileRatingText = ratingCount >= ratingMinReviews ? rating.toFixed(1) : `${ratingCount}/${ratingMinReviews}`;
  const profileRatingSuffix = ratingCount >= ratingMinReviews ? "score" : "reviews";

  useEffect(() => {
    if (!uid) return;
    let mounted = true;

    getUserRole(uid)
      .then(async (currentRole) => {
        if (!mounted) return;
        if (currentRole === "employee") {
          setRole("employee");
          const employeeCompanyId = await getEmployeeCompanyId(uid);
          if (!mounted) return;
          setCompanyId(employeeCompanyId);
          if (employeeCompanyId) {
            const company = await fetchCompanyById(employeeCompanyId);
            if (!mounted) return;
            setCompanyLabel(company?.name ?? "Jouw salon");
          }
          return;
        }

        setRole("company");
        setCompanyId(uid);
        setCompanyLabel("");
      })
      .catch(() => {
        if (!mounted) return;
        setRole("company");
        setCompanyId(uid);
      });

    return () => {
      mounted = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!companyId || isEmployee) return;

    let mounted = true;

    ensureCompanyDoc(companyId)
      .then(async () => {
        const publicSnap = await getDoc(doc(db, "companies_public", companyId));
        const privateSnap = await getDoc(doc(db, "companies", companyId));
        const [followersCount, likesTotal, ratingData] = await Promise.all([
          getCompanyFollowersCount(companyId),
          getCompanyTotalLikes(companyId),
          getCompanyProfileRating(companyId),
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

        let nextOwnerId = "";
        if (privateSnap.exists()) {
          const d = privateSnap.data();
          nextOwnerId = String(d.ownerId ?? companyId);
          setOwnerId(nextOwnerId);
          setKvk(String(d.kvk ?? ""));
          setPhone(String(d.phone ?? ""));
          setEmail(String(d.email ?? auth.currentUser?.email ?? ""));
        } else {
          nextOwnerId = companyId;
          setOwnerId(companyId);
        }

        setFollowers(followersCount);
        setLikes(likesTotal);
        setRating(ratingData.avg);
        setRatingCount(ratingData.count);
        setRatingMinReviews(ratingData.minReviewCount);
        await ensureOwnerBookableStaff(companyId, publicSnap.exists() ? String(publicSnap.data().name ?? "Eigenaar") : "Eigenaar");
        if (uid && nextOwnerId && uid === nextOwnerId) {
          const teamRows = await fetchCompanyEmployees(companyId);
          if (!mounted) return;
          setEmployees(teamRows);
        }
      })
      .catch((error: any) => {
        Alert.alert("Fout", error?.message ?? "Kon bedrijfsprofiel niet laden.");
      });

    return () => {
      mounted = false;
    };
  }, [companyId, isEmployee, uid]);

  useEffect(() => {
    if (!companyId || !isFocused || isEmployee) return;
    const unsub = subscribeMyUnreadNotificationsCount(companyId, setUnreadCount, () => null);
    return unsub;
  }, [companyId, isFocused, isEmployee]);

  function toggleCategory(value: string) {
    setCategories((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  async function loadEmployees() {
    if (!companyId || !isOwner) {
      setEmployees([]);
      return;
    }
    const rows = await fetchCompanyEmployees(companyId);
    setEmployees(rows);
  }

  async function onPickLogoFromLibrary() {
    const media = await pickImageFromLibrary();
    if (!media || !companyId || isEmployee) return;

    try {
      const uploaded = await uploadUriToStorage(
        `companies/${companyId}/logos/${Date.now()}-${media.fileName}`,
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
    if (!media || !companyId || isEmployee) return;

    try {
      const uploaded = await uploadUriToStorage(
        `companies/${companyId}/logos/${Date.now()}-${media.fileName}`,
        media.uri,
        media.mimeType
      );
      setLogoUrl(uploaded);
    } catch (error: any) {
      Alert.alert("Upload mislukt", error?.message ?? "Kon logo niet uploaden.");
    }
  }

  async function onSave() {
    if (!companyId || !uid || isEmployee || !canSave || saving) return;
    setSaving(true);

    try {
      const publicRef = doc(db, "companies_public", companyId);
      const privateRef = doc(db, "companies", companyId);
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
          ownerId: companyId,
          kvk: kvk.trim(),
          phone: phone.trim(),
          email: email.trim(),
          ...(privateSnap.exists() ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await ensureOwnerBookableStaff(companyId, name.trim() || "Eigenaar");
      await syncCompanyBrandingInFeed(companyId);

      Alert.alert("Opgeslagen", "Bedrijfsprofiel is bijgewerkt.");
    } catch (error: any) {
      const code = typeof error?.code === "string" ? ` (${error.code})` : "";
      Alert.alert("Fout", `${error?.message ?? "Opslaan is mislukt."}${code}`);
    } finally {
      setSaving(false);
    }
  }

  async function onAddEmployee() {
    if (!companyId || !isOwner || teamBusy) return;
    setTeamBusy(true);
    try {
      await addCompanyEmployeeByEmail({
        companyId,
        email: employeeEmail,
        displayName: employeeName,
      });
      setEmployeeEmail("");
      setEmployeeName("");
      await loadEmployees();
      Alert.alert("Medewerker toegevoegd", "Deze gebruiker kan nu inloggen als medewerker.");
    } catch (error: any) {
      Alert.alert("Kon medewerker niet toevoegen", error?.message ?? "Probeer opnieuw.");
    } finally {
      setTeamBusy(false);
    }
  }

  function onRemoveEmployee(staffId: string, displayName: string) {
    if (!companyId || !isOwner || teamBusy) return;
    Alert.alert("Medewerker verwijderen", `Verwijder ${displayName} uit je team?`, [
      { text: "Annuleer", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
          setTeamBusy(true);
          try {
            await removeCompanyEmployee(companyId, staffId);
            await loadEmployees();
          } catch (error: any) {
            Alert.alert("Verwijderen mislukt", error?.message ?? "Probeer opnieuw.");
          } finally {
            setTeamBusy(false);
          }
        },
      },
    ]);
  }

  async function onLogout() {
    try {
      await logout();
      router.replace("/(auth)/login" as never);
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon niet uitloggen.");
    }
  }

  if (isEmployee) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.titleBar}>
            <View style={styles.titleRow}>
              <Ionicons name="person-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.title}>Medewerker account</Text>
            </View>
          </View>

          <LinearGradient colors={["#4f8dff", "#2f68df"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.logoWrap}>
                <Ionicons name="person-outline" size={24} color="rgba(255,255,255,0.95)" />
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroTitle}>{auth.currentUser?.email?.split("@")[0] || "Medewerker"}</Text>
                <Text style={styles.heroSub}>{companyLabel || "Salon"}</Text>
              </View>
            </View>
            <Text style={styles.heroBio}>Je ziet alleen je eigen planning en accountgegevens.</Text>
          </LinearGradient>

          <View style={styles.card}>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.readonlyText}>{auth.currentUser?.email || "-"}</Text>

            <Pressable style={styles.primaryBtn} onPress={() => router.push("/(company)/(tabs)/bookings" as never)}>
              <Ionicons name="calendar-outline" size={14} color="#fff" />
              <Text style={styles.primaryBtnText}>Mijn planning</Text>
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
          {companyId ? (
            <Pressable style={styles.quickBtn} onPress={() => router.push(`/(customer)/company/${companyId}` as never)}>
              <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
              <Text style={styles.quickText}>Publiek profiel</Text>
            </Pressable>
          ) : null}
        </View>

        {isOwner ? (
          <View style={styles.teamCard}>
            <View style={styles.teamTitleRow}>
              <Ionicons name="people-outline" size={16} color={COLORS.primary} />
              <Text style={styles.teamTitle}>Team beheren</Text>
            </View>
            <Text style={styles.teamSubtitle}>Voeg medewerkers toe via e-mail. Hun rol wordt automatisch medewerker.</Text>

            <TextInput
              style={styles.input}
              value={employeeEmail}
              onChangeText={setEmployeeEmail}
              placeholder="E-mail medewerker"
              placeholderTextColor={COLORS.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              value={employeeName}
              onChangeText={setEmployeeName}
              placeholder="Naam medewerker (optioneel)"
              placeholderTextColor={COLORS.placeholder}
            />
            <Pressable
              style={[styles.primaryBtn, (!employeeEmail.trim() || teamBusy) && styles.disabled]}
              onPress={onAddEmployee}
              disabled={!employeeEmail.trim() || teamBusy}
            >
              <Ionicons name="person-add-outline" size={14} color="#fff" />
              <Text style={styles.primaryBtnText}>{teamBusy ? "Bezig..." : "Medewerker toevoegen"}</Text>
            </Pressable>

            <View style={styles.teamList}>
              {employees.length ? (
                employees.map((member) => (
                  <View key={member.id} style={styles.teamItem}>
                    <View style={styles.teamItemMeta}>
                      <Text style={styles.teamItemName}>{member.displayName}</Text>
                      <Text style={styles.teamItemEmail}>{member.email || member.id}</Text>
                    </View>
                    <Pressable style={styles.teamRemoveBtn} onPress={() => onRemoveEmployee(member.id, member.displayName)}>
                      <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                      <Text style={styles.teamRemoveText}>Verwijder</Text>
                    </Pressable>
                  </View>
                ))
              ) : (
                <Text style={styles.teamEmptyText}>Nog geen medewerkers toegevoegd.</Text>
              )}
            </View>
          </View>
        ) : null}

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
  teamCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  teamTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teamTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  teamSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  teamList: {
    marginTop: 2,
    gap: 8,
  },
  teamItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  teamItemMeta: {
    flex: 1,
    gap: 2,
  },
  teamItemName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  teamItemEmail: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  teamRemoveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f4c3d2",
    backgroundColor: "#fff0f5",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  teamRemoveText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "800",
  },
  teamEmptyText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
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
  readonlyText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
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
