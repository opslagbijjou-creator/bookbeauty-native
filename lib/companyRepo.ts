import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { hasActiveService } from "./serviceRepo";
import type { Category } from "./ui";

export type CompanyPublic = {
  id: string;
  name: string;
  city: string;
  categories: string[];
  minPrice: number;
  isActive: boolean;
  bio?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  ratingAvg?: number;
  ratingCount?: number;
  badge?: string;
};

export type FetchCompaniesParams = {
  query?: string;
  category?: Category;
  city?: string;
  take?: number;
};

function toCompanyPublic(id: string, data: Record<string, unknown>): CompanyPublic {
  return {
    id,
    name: String(data.name ?? "Onbekende salon"),
    city: String(data.city ?? ""),
    categories: Array.isArray(data.categories) ? (data.categories as string[]) : [],
    minPrice: Number(data.minPrice ?? 0),
    isActive: Boolean(data.isActive),
    bio: typeof data.bio === "string" ? data.bio : undefined,
    logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : undefined,
    coverImageUrl: typeof data.coverImageUrl === "string" ? data.coverImageUrl : undefined,
    ratingAvg: typeof data.ratingAvg === "number" ? data.ratingAvg : undefined,
    ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : undefined,
    badge: typeof data.badge === "string" ? data.badge : undefined,
  };
}

export async function fetchCompanies(params: FetchCompaniesParams = {}): Promise<CompanyPublic[]> {
  const { query: text, category, city, take = 30 } = params;

  const constraints = [where("isActive", "==", true)] as const;
  const base = category
    ? query(
        collection(db, "companies_public"),
        ...constraints,
        where("categories", "array-contains", category),
        orderBy("name", "asc"),
        limit(take)
      )
    : query(collection(db, "companies_public"), ...constraints, orderBy("name", "asc"), limit(take));

  const snap = await getDocs(base);
  const rows = snap.docs.map((d) => toCompanyPublic(d.id, d.data()));

  const q = (text ?? "").trim().toLowerCase();
  const cityFilter = (city ?? "").trim().toLowerCase();

  const filteredBySearch = rows.filter((r) => {
    const matchesText =
      q.length === 0 ||
      r.name.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q) ||
      r.categories.some((c) => c.toLowerCase().includes(q));

    const matchesCity = cityFilter.length === 0 || cityFilter === "alle" || r.city.toLowerCase() === cityFilter;

    return matchesText && matchesCity;
  });

  if (!filteredBySearch.length) return [];

  const hasServices = await Promise.all(
    filteredBySearch.map(async (company) => {
      try {
        return await hasActiveService(company.id);
      } catch {
        return false;
      }
    })
  );

  return filteredBySearch.filter((_, index) => hasServices[index]);
}

export async function fetchCompanyById(companyId: string): Promise<CompanyPublic | null> {
  const snap = await getDoc(doc(db, "companies_public", companyId));
  if (!snap.exists()) return null;
  return toCompanyPublic(snap.id, snap.data());
}

export async function getMyCompanyPublic(companyId: string): Promise<CompanyPublic | null> {
  return fetchCompanyById(companyId);
}

export async function upsertMyCompanyPublic(
  companyId: string,
  patch: Partial<Omit<CompanyPublic, "id">>
): Promise<void> {
  const ref = doc(db, "companies_public", companyId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      name: patch.name ?? "Nieuwe salon",
      city: patch.city ?? "",
      categories: patch.categories ?? [],
      minPrice: patch.minPrice ?? 0,
      isActive: patch.isActive ?? true,
      bio: patch.bio ?? "",
      logoUrl: patch.logoUrl ?? "",
      coverImageUrl: patch.coverImageUrl ?? "",
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
