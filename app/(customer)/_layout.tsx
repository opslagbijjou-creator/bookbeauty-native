import React, { useEffect } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { getUserRole, subscribeAuth } from "../../lib/authRepo";

export default function CustomerStackLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicCatalogRoute = pathname.startsWith("/company/") || pathname.startsWith("/service/");

  useEffect(() => {
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        router.replace("/(auth)/login" as never);
        return;
      }

      const role = await getUserRole(user.uid);
      if (role === "admin") {
        router.replace("/(admin)/(tabs)" as never);
      } else if (role === "company") {
        if (!isPublicCatalogRoute) {
          router.replace("/(company)/(tabs)/home" as never);
        }
      } else if (role === "employee") {
        if (!isPublicCatalogRoute) {
          router.replace("/(company)/(tabs)/bookings" as never);
        }
      }
    });

    return unsub;
  }, [router, isPublicCatalogRoute]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
