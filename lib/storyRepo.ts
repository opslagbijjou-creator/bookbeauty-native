import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type CompanyStory = {
  id: string;
  companyId: string;
  companyName?: string;
  companyLogoUrl?: string;
  mediaType: "video" | "image";
  videoUrl: string;
  imageUrl: string;
  thumbnailUrl?: string;
  title?: string;
  caption?: string;
  clipStartSec?: number;
  clipEndSec?: number;
  createdAtMs: number;
  expiresAtMs: number;
};

export type AddCompanyStoryPayload = {
  mediaType: "video" | "image";
  videoUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  caption?: string;
  clipStartSec?: number;
  clipEndSec?: number;
};

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORY_FETCH_LIMIT = 30;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return next.length ? next : undefined;
}

function normalizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    const next = (value as { toMillis: () => number }).toMillis();
    if (Number.isFinite(next) && next > 0) return next;
  }
  return 0;
}

function toStory(id: string, data: Record<string, unknown>): CompanyStory {
  const mediaType: "video" | "image" = data.mediaType === "image" ? "image" : "video";
  const createdAtMs = toMillis(data.createdAtMs) || toMillis(data.createdAt) || 0;
  const expiresAtMs = toMillis(data.expiresAtMs) || toMillis(data.expiresAt) || 0;

  return {
    id,
    companyId: String(data.companyId ?? ""),
    companyName: normalizeOptionalString(data.companyName),
    companyLogoUrl: normalizeOptionalString(data.companyLogoUrl),
    mediaType,
    videoUrl: mediaType === "video" ? String(data.videoUrl ?? "") : "",
    imageUrl: mediaType === "image" ? String(data.imageUrl ?? "") : "",
    thumbnailUrl: normalizeOptionalString(data.thumbnailUrl),
    title: normalizeOptionalString(data.title),
    caption: normalizeOptionalString(data.caption),
    clipStartSec: normalizeNonNegativeNumber(data.clipStartSec),
    clipEndSec: normalizeNonNegativeNumber(data.clipEndSec),
    createdAtMs,
    expiresAtMs,
  };
}

function sortStoriesByCreatedAt(stories: CompanyStory[]): CompanyStory[] {
  return [...stories].sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
}

function onlyActiveStories(stories: CompanyStory[]): CompanyStory[] {
  const nowMs = Date.now();
  return sortStoriesByCreatedAt(stories).filter((story) => story.expiresAtMs > nowMs);
}

function storiesCollection(companyId: string) {
  return collection(db, "companies_public", companyId, "stories");
}

export async function fetchCompanyActiveStories(companyId: string): Promise<CompanyStory[]> {
  const cleanCompanyId = companyId.trim();
  if (!cleanCompanyId) return [];

  const q = query(storiesCollection(cleanCompanyId), orderBy("createdAt", "asc"), limit(STORY_FETCH_LIMIT));
  const snap = await getDocs(q);
  const stories = snap.docs.map((row) => toStory(row.id, row.data()));
  return onlyActiveStories(stories);
}

export function subscribeCompanyActiveStories(
  companyId: string,
  onData: (stories: CompanyStory[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const cleanCompanyId = companyId.trim();
  if (!cleanCompanyId) {
    onData([]);
    return () => {};
  }

  const q = query(storiesCollection(cleanCompanyId), orderBy("createdAt", "asc"), limit(STORY_FETCH_LIMIT));
  return onSnapshot(
    q,
    (snap) => {
      const stories = snap.docs.map((row) => toStory(row.id, row.data()));
      onData(onlyActiveStories(stories));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function addCompanyStory(companyId: string, payload: AddCompanyStoryPayload): Promise<void> {
  const cleanCompanyId = companyId.trim();
  if (!cleanCompanyId) {
    throw new Error("Bedrijf ontbreekt.");
  }

  const mediaType: "video" | "image" = payload.mediaType === "image" ? "image" : "video";
  const videoUrl = normalizeOptionalString(payload.videoUrl) ?? "";
  const imageUrl = normalizeOptionalString(payload.imageUrl) ?? "";
  const thumbnailUrl = normalizeOptionalString(payload.thumbnailUrl);
  const title = normalizeOptionalString(payload.title) ?? "";
  const caption = normalizeOptionalString(payload.caption) ?? "";
  const clipStartSec = normalizeNonNegativeNumber(payload.clipStartSec);
  const clipEndSec = normalizeNonNegativeNumber(payload.clipEndSec);

  if (mediaType === "video" && !videoUrl) {
    throw new Error("Story video ontbreekt.");
  }
  if (mediaType === "image" && !imageUrl) {
    throw new Error("Story foto ontbreekt.");
  }

  const companySnap = await getDoc(doc(db, "companies_public", cleanCompanyId));
  const companyData = companySnap.exists() ? companySnap.data() : null;
  const nowMs = Date.now();
  const expiresAtMs = nowMs + STORY_TTL_MS;

  await addDoc(storiesCollection(cleanCompanyId), {
    companyId: cleanCompanyId,
    companyName: normalizeOptionalString(companyData?.name) ?? "",
    companyLogoUrl: normalizeOptionalString(companyData?.logoUrl) ?? "",
    mediaType,
    videoUrl: mediaType === "video" ? videoUrl : "",
    imageUrl: mediaType === "image" ? imageUrl : "",
    thumbnailUrl: thumbnailUrl ?? (mediaType === "image" ? imageUrl : ""),
    title,
    caption,
    clipStartSec: mediaType === "video" ? clipStartSec : 0,
    clipEndSec: mediaType === "video" ? clipEndSec : 0,
    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    expiresAtMs,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCompanyStory(companyId: string, storyId: string): Promise<void> {
  const cleanCompanyId = companyId.trim();
  const cleanStoryId = storyId.trim();
  if (!cleanCompanyId || !cleanStoryId) return;
  await deleteDoc(doc(db, "companies_public", cleanCompanyId, "stories", cleanStoryId));
}
