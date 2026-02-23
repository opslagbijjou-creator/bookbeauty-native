import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getUserRole, subscribeAuth } from "../lib/authRepo";
import { COLORS } from "../lib/ui";

export default function IndexScreen() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        router.replace("/(auth)/login" as never);
        setLoading(false);
        return;
      }

      try {
        const role = await getUserRole(user.uid);

        if (role === "company") {
          router.replace("/(company)/(tabs)/home" as never);
        } else if (role === "employee") {
          router.replace("/(company)/(tabs)/bookings" as never);
        } else if (role === "admin") {
          router.replace("/(admin)/(tabs)" as never);
        } else if (role === "influencer") {
          router.replace("/(customer)/(tabs)/profile" as never);
        } else {
          router.replace("/(customer)/(tabs)" as never);
        }
      } catch (error) {
        console.warn("[index] role redirect failed, fallback customer", error);
        router.replace("/(customer)/(tabs)" as never);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  return (
    <View style={styles.screen}>
      {loading ? <ActivityIndicator size="large" color={COLORS.primary} /> : <Text>Redirecting...</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
