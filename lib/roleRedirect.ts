import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { router } from "expo-router";

export async function redirectAfterLogin(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    router.replace("/(customer)/(tabs)");
    return;
  }

  const data = snap.data();

  if (data.role === "company") {
    router.replace("/(company)/(tabs)");
  } else {
    router.replace("/(customer)/(tabs)");
  }
}