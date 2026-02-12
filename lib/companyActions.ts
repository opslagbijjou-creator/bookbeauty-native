// FILE: lib/companyActions.ts
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export async function ensureCompanyDoc() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const ref = doc(db, "companies", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Maak minimale company doc aan
    await setDoc(ref, {
      name: "Nieuw bedrijf",
      city: "",
      categories: ["Overig"],
      isActive: true,
      minPrice: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ownerId: uid,
    });
    return;
  }

  // update timestamp (optioneel)
  await updateDoc(ref, { updatedAt: serverTimestamp() });
}