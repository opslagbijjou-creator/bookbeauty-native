import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getUserRole } from "../lib/userRepo";

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          router.replace("/(auth)/login" as any);
          return;
        }

        const role = await getUserRole(user.uid);

        if (role === "company") router.replace("/(company)/home" as any);
        else if (role === "admin") router.replace("/(admin)/home" as any);
        else router.replace("/(customer)/home" as any);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <View style={{ flex: 1 }} />;
}