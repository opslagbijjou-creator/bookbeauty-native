import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Category } from "./ui";

export type CompanyService = {
  id: string;
  name: string;
  description?: string;
  category: Category | string;
  price: number;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  capacity: number;
  isActive: boolean;
  photoUrls: string[];
};

export type ServicePayload = Omit<CompanyService, "id">;

function normalizePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value.map((x) => String(x ?? "").trim()).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 3);
}

function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.floor(raw));
}

function normalizeCapacity(value: unknown, fallback = 1): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.floor(raw));
}

function mapService(id: string, data: Record<string, unknown>): CompanyService {
  return {
    id,
    name: String(data.name ?? "Onbekende dienst"),
    description: typeof data.description === "string" ? data.description : undefined,
    category: String(data.category ?? "Overig"),
    price: Number(data.price ?? 0),
    durationMin: Number(data.durationMin ?? 0),
    bufferBeforeMin: normalizeNonNegativeInt(data.bufferBeforeMin, 0),
    bufferAfterMin: normalizeNonNegativeInt(data.bufferAfterMin, 0),
    capacity: normalizeCapacity(data.capacity, 1),
    isActive: Boolean(data.isActive),
    photoUrls: normalizePhotoUrls(data.photoUrls),
  };
}

async function syncCompanyMinPrice(companyId: string): Promise<void> {
  const q = query(
    collection(db, "companies_public", companyId, "services_public"),
    where("isActive", "==", true),
    orderBy("price", "asc"),
    limit(1)
  );
  const snap = await getDocs(q);
  const minPrice = snap.docs[0] ? Number(snap.docs[0].data().price ?? 0) : 0;

  await updateDoc(doc(db, "companies_public", companyId), {
    minPrice,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchCompanyServicesPublic(companyId: string): Promise<CompanyService[]> {
  const q = query(
    collection(db, "companies_public", companyId, "services_public"),
    where("isActive", "==", true),
    orderBy("category", "asc"),
    orderBy("price", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapService(d.id, d.data()));
}

export async function fetchMyServices(companyId: string): Promise<CompanyService[]> {
  const q = query(
    collection(db, "companies_public", companyId, "services_public"),
    orderBy("category", "asc"),
    orderBy("price", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapService(d.id, d.data()));
}

export async function fetchCompanyServiceById(
  companyId: string,
  serviceId: string
): Promise<CompanyService | null> {
  const snap = await getDoc(doc(db, "companies_public", companyId, "services_public", serviceId));
  if (!snap.exists()) return null;
  return mapService(snap.id, snap.data());
}

export async function hasActiveService(companyId: string): Promise<boolean> {
  const q = query(
    collection(db, "companies_public", companyId, "services_public"),
    where("isActive", "==", true),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function addMyService(companyId: string, payload: ServicePayload): Promise<void> {
  await addDoc(collection(db, "companies_public", companyId, "services_public"), {
    ...payload,
    bufferBeforeMin: normalizeNonNegativeInt(payload.bufferBeforeMin, 0),
    bufferAfterMin: normalizeNonNegativeInt(payload.bufferAfterMin, 0),
    capacity: normalizeCapacity(payload.capacity, 1),
    photoUrls: normalizePhotoUrls(payload.photoUrls),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await syncCompanyMinPrice(companyId);
}

export async function updateMyService(
  companyId: string,
  serviceId: string,
  patch: Partial<ServicePayload>
): Promise<void> {
  const nextPatch = { ...patch } as Partial<ServicePayload>;
  if ("photoUrls" in nextPatch) {
    nextPatch.photoUrls = normalizePhotoUrls(nextPatch.photoUrls);
  }
  if ("bufferBeforeMin" in nextPatch) {
    nextPatch.bufferBeforeMin = normalizeNonNegativeInt(nextPatch.bufferBeforeMin, 0);
  }
  if ("bufferAfterMin" in nextPatch) {
    nextPatch.bufferAfterMin = normalizeNonNegativeInt(nextPatch.bufferAfterMin, 0);
  }
  if ("capacity" in nextPatch) {
    nextPatch.capacity = normalizeCapacity(nextPatch.capacity, 1);
  }

  await updateDoc(doc(db, "companies_public", companyId, "services_public", serviceId), {
    ...nextPatch,
    updatedAt: serverTimestamp(),
  });
  await syncCompanyMinPrice(companyId);
}

export async function deleteMyService(companyId: string, serviceId: string): Promise<void> {
  await deleteDoc(doc(db, "companies_public", companyId, "services_public", serviceId));
  await syncCompanyMinPrice(companyId);
}
