// FILE: lib/companyRepo.ts
import {
  collection,
  getDocs,
  query as fsQuery,
  where,
  orderBy,
  limit,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";



export type CompanyCategory =
  | "Kapper"
  | "Nagels"
  | "Wimpers"
  | "Wenkbrauwen"
  | "Make-up"
  | "Massage"
  | "Spa"
  | "Barber"
  | "Overig";

  import { doc, getDoc } from "firebase/firestore";

export async function fetchCompanyById(companyId: string): Promise<Company> {
  const snap = await getDoc(doc(db, "companies", companyId));
  if (!snap.exists()) throw new Error("Company bestaat niet.");
  
  const data = snap.data() as any;
  return {
    id: snap.id,
    name: String(data.name ?? data.naam ?? "Salon"),
    city: String(data.city ?? ""),
    categories: Array.isArray(data.categories) ? data.categories : ["Overig"],
    minPrice: typeof data.minPrice === "number" ? data.minPrice : undefined,
    isActive: data.isActive ?? true,
  };
}

export type Company = {
  id: string;
  name: string;
  city: string;
  categories: CompanyCategory[];
  minPrice?: number;
  isActive?: boolean;
  // optioneel voor later
  coverImageUrl?: string;
  logoUrl?: string;
  bio?: string;
  ratingAvg?: number;
  ratingCount?: number;
};

export type CompanySearchParams = {
  query?: string;
  city?: string; // undefined = alle
  category?: CompanyCategory; // undefined = alles
  maxPrice?: number | null;
  take?: number;
};

function norm(s?: string) {
  return (s ?? "").trim().toLowerCase();
}

export async function fetchCompanies(params: CompanySearchParams = {}): Promise<Company[]> {
  const take = params.take ?? 50;
  const constraints: QueryConstraint[] = [];

  // ✅ Alleen actieve salons
  constraints.push(where("isActive", "==", true));

  if (params.city && params.city.trim()) {
    constraints.push(where("city", "==", params.city));
  }

  if (params.category) {
    constraints.push(where("categories", "array-contains", params.category));
  }

  // Let op: als je minPrice filtert met <=, moet je OOK orderBy(minPrice) eerst doen
  if (typeof params.maxPrice === "number") {
    constraints.push(where("minPrice", "<=", params.maxPrice));
    constraints.push(orderBy("minPrice", "asc"));
  }

  constraints.push(orderBy("name", "asc"));
  constraints.push(limit(take));

  // ✅ Gebruik jouw echte collectie: "companies"
  const q = fsQuery(collection(db, "companies_public"), ...constraints);
  const snap = await getDocs(q);

  let items: Company[] = snap.docs.map((d) => {
    const data = d.data() as any;
    const rawCats = data.categories ?? [];

    return {
      id: d.id,
      name: String(data.name ?? data.naam ?? "Salon"),
      city: String(data.city ?? ""),
      categories: Array.isArray(rawCats) ? (rawCats as CompanyCategory[]) : ["Overig"],
      minPrice: typeof data.minPrice === "number" ? data.minPrice : undefined,
      isActive: typeof data.isActive === "boolean" ? data.isActive : true,
      coverImageUrl: data.coverImageUrl ? String(data.coverImageUrl) : undefined,
      logoUrl: data.logoUrl ? String(data.logoUrl) : undefined,
      bio: data.bio ? String(data.bio) : undefined,
      ratingAvg: typeof data.ratingAvg === "number" ? data.ratingAvg : undefined,
      ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : undefined,
    };
  });

  // ✅ Search filter client-side (alleen op naam)
  if (params.query && params.query.trim()) {
    const qText = norm(params.query);
    items = items.filter((c) => norm(c.name).includes(qText));
  }

  return items;
}