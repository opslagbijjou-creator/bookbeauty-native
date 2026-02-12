// FILE: lib/serviceRepo.ts

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "./firebase";

/** ✅ Service type */
export type CompanyService = {
  id: string;
  companyId: string;

  name: string;
  price: number;
  durationMin: number;

  isActive: boolean;
};

/** ✅ Fetch services van bedrijf */
export async function fetchMyServices(companyId: string) {
  const q = query(
    collection(db, "services"),
    where("companyId", "==", companyId),
    orderBy("name", "asc")
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  })) as CompanyService[];
}

/** ✅ Add service */
export async function addMyService(service: Omit<CompanyService, "id">) {
  await addDoc(collection(db, "services"), service);
}

/** ✅ Delete service */
export async function deleteMyService(serviceId: string) {
  await deleteDoc(doc(db, "services", serviceId));
}

/** ✅ Update service */
export async function updateMyService(
  serviceId: string,
  patch: Partial<CompanyService>
) {
  await updateDoc(doc(db, "services", serviceId), patch);
}