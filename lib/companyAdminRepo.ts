// lib/companyAdminRepo.ts
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function createCompany(uid: string, input: any) {
  // private doc
  await setDoc(
    doc(db, "companies", uid),
    {
      ownerId: uid,
      kvk: input.kvk ?? null,
      name: input.name?.trim() ?? "",
      city: input.city?.trim() ?? "",
      categories: input.categories ?? ["Overig"],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // public doc (customer leest deze)
  await setDoc(
    doc(db, "companies_public", uid),
    {
      name: input.name?.trim() ?? "",
      city: input.city?.trim() ?? "",
      categories: input.categories ?? ["Overig"],
      minPrice: Number(input.minPrice ?? 0),
      isActive: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}