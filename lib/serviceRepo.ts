// FILE: lib/serviceRepo.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

export type CompanyService = {
  id: string;
  companyId: string;
  name: string;
  price: number;
  durationMin: number;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};

function servicesPublicCol(companyId: string) {
  return collection(db, "companies", companyId, "services_public");
}

function servicePublicDoc(companyId: string, serviceId: string) {
  return doc(db, "companies", companyId, "services_public", serviceId);
}

export async function fetchCompanyServices(companyId: string): Promise<CompanyService[]> {
  const q = query(
    servicesPublicCol(companyId),
    where("isActive", "==", true),
    orderBy("createdAt", "desc") // mag, als createdAt bestaat
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    companyId,
    ...(d.data() as any),
  })) as CompanyService[];
}

export async function addMyService(
  companyId: string,
  input: Omit<CompanyService, "id" | "companyId" | "createdAt" | "updatedAt">
) {
  const payload = {
    name: input.name,
    price: input.price,
    durationMin: input.durationMin,
    isActive: input.isActive ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // ✅ schrijf naar subcollection (niet meer naar "services")
  await addDoc(servicesPublicCol(companyId), payload);
}

export async function updateMyService(
  companyId: string,
  serviceId: string,
  patch: Partial<Omit<CompanyService, "id" | "companyId">>
) {
  // ✅ update in subcollection
  await updateDoc(servicePublicDoc(companyId, serviceId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMyService(companyId: string, serviceId: string) {
  // ✅ delete in subcollection
  await deleteDoc(servicePublicDoc(companyId, serviceId));
}