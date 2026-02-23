import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SupportCenter from "../../components/SupportCenter";
import { getUserRole, subscribeAuth } from "../../lib/authRepo";
import { auth } from "../../lib/firebase";
import type { AppRole } from "../../lib/roles";
import { COLORS } from "../../lib/ui";

export default function CustomerSupportScreen() {
  const [uid, setUid] = useState(auth.currentUser?.uid ?? "");
  const [email, setEmail] = useState(auth.currentUser?.email ?? "");
  const [displayNameRaw, setDisplayNameRaw] = useState(auth.currentUser?.displayName ?? "");
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    return subscribeAuth((user) => {
      setUid(user?.uid ?? "");
      setEmail(user?.email ?? "");
      setDisplayNameRaw(user?.displayName ?? "");
    });
  }, []);

  useEffect(() => {
    if (!uid) {
      setRole(null);
      return;
    }
    getUserRole(uid)
      .then((value) => setRole(value))
      .catch(() => setRole("customer"));
  }, [uid]);

  const safeRole = useMemo<AppRole>(() => {
    if (role === "company" || role === "employee" || role === "admin") return "customer";
    if (role === "influencer") return "influencer";
    return "customer";
  }, [role]);

  const displayName = useMemo(() => {
    if (displayNameRaw.trim()) return displayNameRaw.trim();
    if (email.trim()) return email.trim().split("@")[0];
    return "Gebruiker";
  }, [displayNameRaw, email]);

  if (!uid || !role) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={styles.stateWrap}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <SupportCenter
        uid={uid}
        role={safeRole}
        displayName={displayName}
        email={email}
        title="BookBeauty Support"
        subtitle="Stuur je vraag naar ons team. We reageren in deze inbox."
        allowCreateThread
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
