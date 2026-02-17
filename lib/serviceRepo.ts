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
} from "firebase/firestore";
import { db } from "./firebase";

export type ServiceCategory =
  | "Kapper"
  | "Nagels"
  | "Wimpers"
  | "Wenkbrauwen"
  | "Make-up"
  | "Massage"
  | "Spa"
  | "Barber"
  | "Overig";

export type CompanyService = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  category?: ServiceCategory;
  price: number;
  durationMin: number;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};

const servicesRef = (companyId: string) =>
  collection(db, "companies", companyId, "services_public");

export async function fetchMyServices(companyId: string): Promise<CompanyService[]> {
  const snap = await getDocs(servicesRef(companyId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CompanyService[];
}

export async function fetchCompanyServices(companyId: string): Promise<CompanyService[]> {
  const q = query(servicesRef(companyId), where("isActive", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CompanyService[];
}

export async function addMyService(
  companyId: string,
  input: Omit<CompanyService, "id" | "companyId" | "createdAt" | "updatedAt">
) {
  await addDoc(servicesRef(companyId), {
    ...input,
    companyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}



export async function updateMyService(
  companyId: string,
  serviceId: string,
  patch: Partial<Omit<CompanyService, "id" | "companyId">>
) {
  await updateDoc(doc(db, "companies", companyId, "services_public", serviceId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMyService(companyId: string, serviceId: string) {
  await deleteDoc(doc(db, "companies", companyId, "services_public", serviceId));
}