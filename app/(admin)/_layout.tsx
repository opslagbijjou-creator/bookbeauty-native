import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { getUserRole, subscribeAuth } from "../../lib/authRepo";
import { SUPER_ADMIN_UID } from "../../lib/adminAccess";

export default function AdminStackLayout() {
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        router.replace("/(auth)/login" as never);
        return;
      }

      if (user.uid === SUPER_ADMIN_UID) return;

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="revenue" />
      <Stack.Screen name="users" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
