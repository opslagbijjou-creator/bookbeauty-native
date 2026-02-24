import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { SUPER_ADMIN_UID } from "../../lib/adminAccess";
import { auth, db } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

type FoundUser = {
  uid: string;
  email: string;
  role: string;
  companyId: string;
};

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  const viewerUid = String(auth.currentUser?.uid || "").trim();
  const isSuperAdmin = viewerUid === SUPER_ADMIN_UID;

  async function findUserByEmail(emailInput: string): Promise<FoundUser | null> {
    const emailKey = normalizeEmail(emailInput);
    if (!emailKey) return null;

    const lookupSnap = await getDoc(doc(db, "user_lookup", emailKey));
    if (lookupSnap.exists()) {
      const lookupData = lookupSnap.data() as Record<string, unknown>;
      const uid = String(lookupData.uid ?? "").trim();
      if (uid) {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
          const userData = userSnap.data() as Record<string, unknown>;
          return {
            uid,
            email: String(userData.email ?? emailKey).trim(),
            role: String(userData.role ?? "customer").trim(),
            companyId: String(userData.companyId ?? "").trim(),
          };
        }
      }
    }

    const userQuery = query(collection(db, "users"), where("email", "==", emailKey), limit(1));
    const userSnap = await getDocs(userQuery);
    if (userSnap.empty) return null;
    const row = userSnap.docs[0];
    const data = row.data() as Record<string, unknown>;
    return {
      uid: row.id,
      email: String(data.email ?? emailKey).trim(),
      role: String(data.role ?? "customer").trim(),
      companyId: String(data.companyId ?? "").trim(),
    };
  }

  async function onSearch() {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || busy) return;

    setBusy(true);
    try {
      const user = await findUserByEmail(cleanEmail);
      setFoundUser(user);
      if (!user) {
        Alert.alert("Niet gevonden", "Geen gebruiker gevonden met dit e-mailadres.");
      }
    } catch (error: unknown) {
      Alert.alert("Zoeken mislukt", error instanceof Error ? error.message : "Onbekende fout.");
    } finally {
      setBusy(false);
    }
  }

  async function onPromoteToAdmin() {
    if (!isSuperAdmin || !foundUser || busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", foundUser.uid), {
        role: "admin",
        updatedAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "user_lookup", normalizeEmail(foundUser.email)),
        {
          uid: foundUser.uid,
          email: normalizeEmail(foundUser.email),
          role: "admin",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setFoundUser((prev) => (prev ? { ...prev, role: "admin" } : prev));
      Alert.alert("Gelukt", "Gebruiker is nu admin.");
    } catch (error: unknown) {
      Alert.alert("Promoten mislukt", error instanceof Error ? error.message : "Onbekende fout.");
    } finally {
      setBusy(false);
    }
  }

  async function onDemoteAdmin() {
    if (!isSuperAdmin || !foundUser || busy) return;
    if (foundUser.uid === SUPER_ADMIN_UID) {
      Alert.alert("Niet toegestaan", "De super admin kan niet gedemoveerd worden.");
      return;
    }

    setBusy(true);
    try {
      await updateDoc(doc(db, "users", foundUser.uid), {
        role: "customer",
        updatedAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "user_lookup", normalizeEmail(foundUser.email)),
        {
          uid: foundUser.uid,
          email: normalizeEmail(foundUser.email),
          role: "customer",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setFoundUser((prev) => (prev ? { ...prev, role: "customer" } : prev));
      Alert.alert("Gelukt", "Admin rechten zijn verwijderd.");
    } catch (error: unknown) {
      Alert.alert("Demoten mislukt", error instanceof Error ? error.message : "Onbekende fout.");
    } finally {
      setBusy(false);
    }
  }

  const canPromote = useMemo(
    () => isSuperAdmin && !!foundUser && foundUser.role !== "admin",
    [foundUser, isSuperAdmin]
  );
  const canDemote = useMemo(
    () =>
      isSuperAdmin &&
      !!foundUser &&
      foundUser.role === "admin" &&
      foundUser.uid !== SUPER_ADMIN_UID,
    [foundUser, isSuperAdmin]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
            <Text style={styles.backText}>Terug</Text>
          </Pressable>
          <Text style={styles.title}>Admin Users</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Zoek gebruiker op e-mail</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="voorbeeld@domein.nl"
            placeholderTextColor={COLORS.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable
            style={[styles.primaryBtn, (!normalizeEmail(email) || busy) && styles.disabled]}
            onPress={() => onSearch().catch(() => null)}
            disabled={!normalizeEmail(email) || busy}
          >
            <Ionicons name="search-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{busy ? "Bezig..." : "Zoek gebruiker"}</Text>
          </Pressable>
          {!isSuperAdmin ? (
            <Text style={styles.noticeText}>Alleen SUPER ADMIN kan admins promoten of demoten.</Text>
          ) : null}
        </View>

        {foundUser ? (
          <View style={styles.card}>
            <Text style={styles.userTitle}>Gebruiker gevonden</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>UID</Text>
              <Text style={styles.metaValue}>{foundUser.uid}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>E-mail</Text>
              <Text style={styles.metaValue}>{foundUser.email}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Rol</Text>
              <Text style={styles.metaValue}>{foundUser.role || "-"}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Company ID</Text>
              <Text style={styles.metaValue}>{foundUser.companyId || "-"}</Text>
            </View>

            <View style={styles.actionRows}>
              <Pressable
                style={[styles.primaryBtn, (!canPromote || busy) && styles.disabled]}
                onPress={() => onPromoteToAdmin().catch(() => null)}
                disabled={!canPromote || busy}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Promote naar admin</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, (!canDemote || busy) && styles.disabled]}
                onPress={() => onDemoteAdmin().catch(() => null)}
                disabled={!canDemote || busy}
              >
                <Ionicons name="shield-outline" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Demote admin</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  topRow: {
    gap: 8,
  },
  backBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  label: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    minHeight: 44,
    color: COLORS.text,
    fontWeight: "600",
  },
  primaryBtn: {
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryBtn: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  disabled: {
    opacity: 0.55,
  },
  noticeText: {
    color: "#8a6400",
    fontWeight: "700",
    fontSize: 12,
  },
  userTitle: {
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#f2e8ee",
    paddingTop: 8,
  },
  metaLabel: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  metaValue: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },
  actionRows: {
    gap: 8,
    marginTop: 2,
  },
});
