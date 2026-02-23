import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getUserRole, subscribeAuth } from "../../lib/authRepo";
import { COLORS } from "../../lib/ui";

export default function AdminLoginScreen() {
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        router.replace("/(auth)/login" as never);
        return;
      }

      const role = await getUserRole(user.uid);
      if (role === "admin") {
        router.replace("/(admin)/(tabs)" as never);
      } else {
        router.replace("/(auth)/login" as never);
      }
    });

    return unsub;
  }, [router]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.stateWrap}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
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
