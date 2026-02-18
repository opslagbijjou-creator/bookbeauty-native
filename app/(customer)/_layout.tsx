import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { getUserRole, subscribeAuth } from "../../lib/authRepo";

export default function CustomerStackLayout() {
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
      }
    });

    return unsub;
  }, [router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
