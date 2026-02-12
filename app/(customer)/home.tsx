// FILE: app/(customer)/home.tsx
import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function CustomerHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(customer)/(tabs)" as any);
  }, [router]);

  return <View style={{ flex: 1 }} />;
}