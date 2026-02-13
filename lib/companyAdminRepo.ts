import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function createCompany(uid: string, input: any) {
  // private doc
  await setDoc(doc(db, "companies", uid), {
    ownerId: uid,
    kvk: input.kvk,
    name: input.name,
    city: input.city,
    categories: input.categories,
    createdAt: new Date(),
  });

  // public doc
  await setDoc(doc(db, "companies_public", uid), {
    name: input.name,
    city: input.city,
    categories: input.categories,
    minPrice: input.minPrice ?? 0,
    isActive: true,
  });
}