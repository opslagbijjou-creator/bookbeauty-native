import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { fetchCompanyById } from "./companyRepo";

export type PublicStaffMember = {
  id: string;
  companyId: string;
  displayName: string;
  isActive: boolean;
  isOwner: boolean;
};

export type CompanyStaffMember = PublicStaffMember & {
  email?: string;
  phone?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

function toMillis(value: unknown): number {
  const input = value as { toMillis?: () => number } | undefined;
  if (input && typeof input.toMillis === "function") {
    return input.toMillis();
  }
  return 0;
}

function normalizeDisplayName(value: unknown, fallback: string): string {
  const cleaned = String(value ?? "").trim();
  if (cleaned.length >= 2) return cleaned;
  return fallback;
}

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicStaff(
  id: string,
  companyId: string,
  data: Record<string, unknown>,
  fallbackName: string
): PublicStaffMember {
  return {
    id,
    companyId,
    displayName: normalizeDisplayName(data.displayName, fallbackName),
    isActive: typeof data.isActive === "boolean" ? Boolean(data.isActive) : true,
    isOwner: Boolean(data.isOwner) || id === companyId,
  };
}

function toCompanyStaff(id: string, companyId: string, data: Record<string, unknown>): CompanyStaffMember {
  const fallback = id === companyId ? "Eigenaar" : "Medewerker";
  return {
    ...toPublicStaff(id, companyId, data, fallback),
    email: typeof data.email === "string" ? data.email : undefined,
    phone: typeof data.phone === "string" ? data.phone : undefined,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export async function ensureOwnerBookableStaff(companyId: string, ownerDisplayName?: string): Promise<void> {
  const fallbackName = ownerDisplayName?.trim() || "Eigenaar";

  await setDoc(
    doc(db, "companies_public", companyId, "staff_public", companyId),
    {
      displayName: fallbackName,
      isActive: true,
      isOwner: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "companies", companyId, "staff", companyId),
    {
      userId: companyId,
      companyId,
      displayName: fallbackName,
      isActive: true,
      isOwner: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchPublicCompanyStaff(
  companyId: string,
  ownerDisplayName?: string
): Promise<PublicStaffMember[]> {
  const company = ownerDisplayName?.trim() ? null : await fetchCompanyById(companyId);
  const fallbackOwnerName = ownerDisplayName?.trim() || company?.name || "Salon team";

  const snap = await getDocs(query(collection(db, "companies_public", companyId, "staff_public"), orderBy("displayName", "asc")));
  const rows = snap.docs
    .map((row) => toPublicStaff(row.id, companyId, row.data(), fallbackOwnerName))
    .filter((row) => row.isActive);

  if (!rows.some((row) => row.id === companyId)) {
    rows.unshift({
      id: companyId,
      companyId,
      displayName: fallbackOwnerName,
      isActive: true,
      isOwner: true,
    });
  }

  return rows;
}

export async function fetchCompanyEmployees(companyId: string): Promise<CompanyStaffMember[]> {
  const snap = await getDocs(query(collection(db, "companies", companyId, "staff"), orderBy("displayName", "asc")));
  return snap.docs
    .map((row) => toCompanyStaff(row.id, companyId, row.data()))
    .filter((row) => row.isActive && !row.isOwner);
}

export async function addCompanyEmployeeByEmail(params: {
  companyId: string;
  email: string;
  displayName?: string;
}): Promise<void> {
  const { companyId, email, displayName } = params;
  const key = emailKey(email);
  if (!key || !key.includes("@")) {
    throw new Error("Vul een geldig e-mailadres in.");
  }

  const lookupSnap = await getDoc(doc(db, "user_lookup", key));
  if (!lookupSnap.exists()) {
    throw new Error("Gebruiker niet gevonden. Laat deze persoon eerst minstens 1x inloggen.");
  }

  const lookupData = lookupSnap.data() as Record<string, unknown>;
  const targetUid = String(lookupData.uid ?? "").trim();
  if (!targetUid) {
    throw new Error("Gebruiker niet gevonden.");
  }
  if (targetUid === companyId) {
    throw new Error("Je eigen bedrijfseigenaar-account kan geen medewerker worden.");
  }

  const fallbackName = String(lookupData.name ?? key.split("@")[0] ?? "Medewerker");
  const nextName = normalizeDisplayName(displayName, fallbackName);

  const batch = writeBatch(db);

  batch.set(
    doc(db, "users", targetUid),
    {
      role: "employee",
      companyId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    doc(db, "companies", companyId, "staff", targetUid),
    {
      userId: targetUid,
      companyId,
      displayName: nextName,
      email: key,
      isActive: true,
      isOwner: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    doc(db, "companies_public", companyId, "staff_public", targetUid),
    {
      displayName: nextName,
      isActive: true,
      isOwner: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
}

export async function removeCompanyEmployee(companyId: string, staffId: string): Promise<void> {
  if (!staffId || staffId === companyId) {
    throw new Error("De eigenaar kan niet verwijderd worden.");
  }

  const batch = writeBatch(db);

  batch.set(
    doc(db, "companies", companyId, "staff", staffId),
    {
      isActive: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    doc(db, "companies_public", companyId, "staff_public", staffId),
    {
      isActive: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    doc(db, "users", staffId),
    {
      role: "customer",
      companyId: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
}

export async function getEmployeeCompanyId(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const role = String(data.role ?? "");
  const companyId = String(data.companyId ?? "");
  if (role !== "employee" || !companyId) return null;
  return companyId;
}
