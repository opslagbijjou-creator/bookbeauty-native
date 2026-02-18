import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

type CompanyCreateInput = {
  name: string;
  city: string;
  categories: string[];
  bio?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  kvk?: string;
  phone?: string;
  email?: string;
};

const DEFAULT_BOOKING_WEEK_SCHEDULE = {
  mon: { open: true, start: "09:00", end: "18:00" },
  tue: { open: true, start: "09:00", end: "18:00" },
  wed: { open: true, start: "09:00", end: "18:00" },
  thu: { open: true, start: "09:00", end: "18:00" },
  fri: { open: true, start: "09:00", end: "18:00" },
  sat: { open: true, start: "09:00", end: "18:00" },
  sun: { open: false, start: "09:00", end: "18:00" },
} as const;

export async function createCompany(companyId: string, input: CompanyCreateInput): Promise<void> {
  await setDoc(
    doc(db, "companies", companyId),
    {
      ownerId: companyId,
      kvk: input.kvk ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "companies_public", companyId),
    {
      name: input.name,
      city: input.city,
      categories: input.categories,
      minPrice: 0,
      isActive: true,
      bio: input.bio ?? "",
      logoUrl: input.logoUrl ?? "",
      coverImageUrl: input.coverImageUrl ?? "",
      bookingEnabled: true,
      bookingIntervalMin: 30,
      bookingWeekSchedule: DEFAULT_BOOKING_WEEK_SCHEDULE,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function ensureCompanyDoc(companyId: string): Promise<void> {
  const ref = doc(db, "companies_public", companyId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      name: "Nieuwe salon",
      city: "",
      categories: [],
      minPrice: 0,
      isActive: true,
      bio: "",
      logoUrl: "",
      coverImageUrl: "",
      bookingEnabled: true,
      bookingIntervalMin: 30,
      bookingWeekSchedule: DEFAULT_BOOKING_WEEK_SCHEDULE,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, { updatedAt: serverTimestamp() });
}
