import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { getUserRole, subscribeAuth } from "../../lib/authRepo";

export default function AdminStackLayout() {
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        router.replace("/(auth)/login" as never);
        return;
      }

      const role = await getUserRole(user.uid);
      if (role === "admin") return;
      if (role === "company" || role === "employee") {
        router.replace("/(company)/(tabs)/home" as never);
      } else {
        router.replace("/(customer)/(tabs)" as never);
      }
    });

    return unsub;
  }, [router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
