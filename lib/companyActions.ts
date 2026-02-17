// lib/companyActions.ts
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export async function ensureCompanyDoc(input?: {
  name?: string;
  city?: string;
  categories?: string[];
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const ref = doc(db, "companies", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      name: input?.name?.trim() || "",      // ✅ geen “Nieuw bedrijf”
      city: input?.city?.trim() || "",
      categories: input?.categories?.length ? input.categories : ["Overig"],
      isActive: true,
      minPrice: 0,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, { updatedAt: serverTimestamp() });
}