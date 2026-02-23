import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppRole } from "./roles";

export const BOOKBEAUTY_COMPANY_ID = "bookbeauty_official";

export type BookBeautyProfile = {
  id: string;
  name: string;
  city: string;
  bio: string;
  logoUrl?: string;
  coverImageUrl?: string;
  badge?: string;
};

const DEFAULT_BOOKBEAUTY_PROFILE: Omit<BookBeautyProfile, "id"> = {
  name: "BookBeauty Team",
  city: "Nederland",
  bio: "Officieel BookBeauty profiel. Hier delen we platform-updates, support en tips.",
  logoUrl: "",
  coverImageUrl: "",
  badge: "Official",
};

function normalizeRole(role: AppRole | null | undefined): AppRole {
  if (
    role === "company" ||
    role === "employee" ||
    role === "influencer" ||
    role === "admin"
  ) {
    return role;
  }
  return "customer";
}

export async function ensureBookBeautyAutoFollow(uid: string, role: AppRole | null | undefined): Promise<void> {
  const cleanUid = uid.trim();
  if (!cleanUid) return;

  await setDoc(
    doc(db, "companies_public", BOOKBEAUTY_COMPANY_ID, "followers", cleanUid),
    {
      userId: cleanUid,
      role: normalizeRole(role),
      autoFollowed: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchBookBeautyProfile(): Promise<BookBeautyProfile> {
  const snap = await getDoc(doc(db, "companies_public", BOOKBEAUTY_COMPANY_ID));
  if (!snap.exists()) {
    return {
      id: BOOKBEAUTY_COMPANY_ID,
      ...DEFAULT_BOOKBEAUTY_PROFILE,
    };
  }

  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(data.name ?? DEFAULT_BOOKBEAUTY_PROFILE.name),
    city: String(data.city ?? DEFAULT_BOOKBEAUTY_PROFILE.city),
    bio: String(data.bio ?? DEFAULT_BOOKBEAUTY_PROFILE.bio),
    logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : undefined,
    coverImageUrl: typeof data.coverImageUrl === "string" ? data.coverImageUrl : undefined,
    badge: typeof data.badge === "string" ? data.badge : undefined,
  };
}

export async function ensureBookBeautyProfileForAdmin(): Promise<void> {
  await setDoc(
    doc(db, "companies_public", BOOKBEAUTY_COMPANY_ID),
    {
      ...DEFAULT_BOOKBEAUTY_PROFILE,
      categories: ["Overig"],
      minPrice: 0,
      isActive: true,
      bookingEnabled: false,
      bookingAutoConfirm: false,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateBookBeautyProfile(
  patch: Partial<Pick<BookBeautyProfile, "name" | "city" | "bio" | "logoUrl" | "coverImageUrl" | "badge">>
): Promise<void> {
  await updateDoc(doc(db, "companies_public", BOOKBEAUTY_COMPANY_ID), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
