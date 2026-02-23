import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SupportCenter from "../../../components/SupportCenter";
import { auth } from "../../../lib/firebase";
import { COLORS } from "../../../lib/ui";
import { subscribeAuth } from "../../../lib/authRepo";

export default function AdminSupportScreen() {
  const [uid, setUid] = useState(auth.currentUser?.uid ?? "");

  useEffect(() => {
    return subscribeAuth((user) => setUid(user?.uid ?? ""));
  }, []);

  if (!uid) {
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
        role="admin"
        displayName="BookBeauty Team"
        title="Support Inbox"
        subtitle="Alle vragen van klanten, bedrijven en influencers op een plek."
        allowCreateThread={false}
        allowStatusChange
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
