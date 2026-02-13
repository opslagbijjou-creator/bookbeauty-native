// FILE: app/index.tsx

import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "expo-router";
import { auth, db } from "../lib/firebase";

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

        const uid = user.uid;
        const snap = await getDoc(doc(db, "users", uid));

        if (!snap.exists()) {
          router.replace("/(auth)/login" as any);
          return;
        }

        const role = snap.data()?.role;

        // ✅ Company → company tabs
        if (role === "company") {
          router.replace("/(company)/(tabs)" as any);
          return;
        }

        // ❌ Admin later pas toevoegen
        // if (role === "admin") {
        //   router.replace("/(admin)/(tabs)" as any);
        //   return;
        // }

        // ✅ Default = customer
        router.replace("/(customer)/(tabs)" as any);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return null;
}