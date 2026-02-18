import { collection, getDocs, orderBy, query, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { CompanyPublic } from "./companyRepo";

export async function adminListCompanies(): Promise<CompanyPublic[]> {
  const snap = await getDocs(query(collection(db, "companies_public"), orderBy("name", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyPublic, "id">) }));
}

export async function adminSetCompanyActive(companyId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, "companies_public", companyId), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

export async function adminSetCompanyBadge(companyId: string, badge: string): Promise<void> {
  await updateDoc(doc(db, "companies_public", companyId), {
    badge,
    updatedAt: serverTimestamp(),
  });
}
