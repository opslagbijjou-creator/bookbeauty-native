import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { CompanyCategory } from "./companyRepo";

export async function createCompanyForUser(params: {
  uid: string;
  name: string;
  city: string;
  categories: CompanyCategory[];
  minPrice?: number;
}) {
  const ref = doc(db, "companies", params.uid);

  await setDoc(
    ref,
    {
      ownerUid: params.uid,
      name: params.name,
      city: params.city,
      categories: params.categories,
      minPrice: params.minPrice ?? 0,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}