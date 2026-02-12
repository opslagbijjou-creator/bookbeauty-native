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

export type Company = {
  id: string;
  name: string;
  city: string;
  categories: CompanyCategory[];
  minPrice?: number;
  isActive?: boolean;
};

export type CompanySearchParams = {
  query?: string;
  city?: string;
  category?: CompanyCategory;
  maxPrice?: number | null;
  take?: number;
};

function norm(s?: string) {
  return (s ?? "").trim().toLowerCase();
}

export async function fetchCompanies(
  params: CompanySearchParams = {}
): Promise<Company[]> {
  const take = params.take ?? 50;
  const constraints: QueryConstraint[] = [];

  // ✅ Alleen actieve salons
  constraints.push(where("isActive", "==", true));

  if (params.city) {
    constraints.push(where("city", "==", params.city));
  }

  if (params.category) {
    constraints.push(where("categories", "array-contains", params.category));
  }

  if (typeof params.maxPrice === "number") {
    constraints.push(where("minPrice", "<=", params.maxPrice));
  }

  constraints.push(orderBy("name", "asc"));
  constraints.push(limit(take));

  const q = fsQuery(collection(db, "companies"), ...constraints);
  const snap = await getDocs(q);

  let items: Company[] = snap.docs.map((doc) => {
    const data = doc.data() as any;

    return {
      id: doc.id,
      name: String(data.name ?? data.naam ?? "Salon"),
      city: String(data.city ?? ""),
      categories: Array.isArray(data.categories)
        ? data.categories
        : ["Overig"],
      minPrice:
        typeof data.minPrice === "number" ? data.minPrice : undefined,
      isActive: data.isActive ?? true,
    };
  });

  // ✅ Search filter client-side
  if (params.query) {
    const qText = norm(params.query);
    items = items.filter((c) => norm(c.name).includes(qText));
  }

  return items;
}