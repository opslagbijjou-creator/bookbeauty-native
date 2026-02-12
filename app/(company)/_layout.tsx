// FILE: app/(company)/_layout.tsx
import React, { useEffect, useState } from "react";
import { Slot, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ActivityIndicator, View } from "react-native";
import { auth, db } from "../../lib/firebase";
import { ensureCompanyDoc } from "../../lib/companyActions";

export default function CompanyLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          router.replace("/(auth)/login");
          return;
        }

        const userSnap = await getDoc(doc(db, "users", u.uid));
        const role = userSnap.data()?.role;

        if (role !== "company") {
          router.replace("/(customer)/(tabs)");
          return;
        }

        // maak company doc aan als die nog niet bestaat
        await ensureCompanyDoc();
        setReady(true);
      } catch (e) {
        console.log("Company guard error:", e);
        // Als rules goed staan, komt dit niet meer voor.
        // Maar we zetten ready wel true zodat je niet vast hangt.
        setReady(true);
      }
    });

    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Slot />;
}