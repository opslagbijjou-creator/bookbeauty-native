import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { isRootAdminIdentity } from "./adminAccess";
import { auth, db } from "./firebase";
import {
  normalizeMediaCropPreset,
  normalizeMediaFilterPreset,
  type MediaCropPreset,
  type MediaFilterPreset,
} from "./mediaEdit";
import type { Category } from "./ui";

export type FeedPost = {
  id: string;
  companyId: string;
  companyName: string;
  companyLogoUrl?: string;
  companyCity?: string;
  companyCategories?: string[];
  serviceId?: string;
  serviceName?: string;
  category: string;
  title?: string;
  caption?: string;
  hashtags?: string[];
  visibility?: "public" | "clients_only";
  mediaType: "video" | "image";
  videoUrl: string;
  imageUrl: string;
  thumbnailUrl?: string;
  sourceVideoUrl?: string;
  sourceImageUrl?: string;
  cropPreset?: MediaCropPreset;
  filterPreset?: MediaFilterPreset;
  clipStartSec?: number;
  clipEndSec?: number;
  videoDurationSec?: number;
  isActive: boolean;
  creatorRole?: "company" | "influencer";
  influencerId?: string;
  influencerName?: string;
  influencerCommissionPercent?: number;
  likeCount?: number;
  viewCount?: number;
  createdAtMs?: number;
};

export type FetchFeedParams = {
  category?: Category;
  companyId?: string;
  pageSize?: number;
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
};

export type FetchFeedResult = {
  items: FeedPost[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  usedFallback?: boolean;
};

export type AddFeedPostPayload = {
  category: string;
  title?: string;
  caption?: string;
  hashtags?: string[];
  visibility?: "public" | "clients_only";
  mediaType?: "video" | "image";
  videoUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  sourceVideoUrl?: string;
  sourceImageUrl?: string;
  cropPreset?: MediaCropPreset;
  filterPreset?: MediaFilterPreset;
  clipStartSec?: number;
  clipEndSec?: number;
  videoDurationSec?: number;
  serviceId?: string;
  serviceName?: string;
  isActive?: boolean;
  viewCount?: number;
  creatorRole?: "company" | "influencer";
  influencerId?: string;
  influencerName?: string;
  influencerCommissionPercent?: number;
};

export type AddInfluencerFeedPostInput = {
  influencerId: string;
  companyId: string;
  payload: AddFeedPostPayload;
};

function normalizeHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((tag) => String(tag ?? "").trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 12);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeLinkedServiceId(value: unknown): string | undefined {
  const raw = normalizeOptionalString(value);
  if (!raw) return undefined;
  if (raw === "undefined" || raw === "null") return undefined;
  return raw;
}

function normalizeOptionalNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, value);
}

function normalizeCommissionPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(30, Number(value)));
}

function toFeedPost(id: string, data: Record<string, unknown>): FeedPost {
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  const rawVideoUrl = String(data.videoUrl ?? "").trim();
  const rawImageUrl = String(data.imageUrl ?? "").trim();
  const rawMediaType = data.mediaType === "image" || data.mediaType === "video" ? data.mediaType : undefined;
  const mediaType: "video" | "image" = rawMediaType ?? (rawImageUrl ? "image" : "video");
  const linkedServiceId = normalizeLinkedServiceId(data.serviceId);
  const linkedServiceName = linkedServiceId ? normalizeOptionalString(data.serviceName) : undefined;
  const creatorRoleRaw = String(data.creatorRole ?? "");
  const creatorRole: "company" | "influencer" =
    creatorRoleRaw === "influencer" ? "influencer" : "company";
  const influencerId = normalizeOptionalString(data.influencerId);
  const influencerName = normalizeOptionalString(data.influencerName);
  const influencerCommissionPercent = normalizeCommissionPercent(data.influencerCommissionPercent);

  return {
    id,
    companyId: String(data.companyId ?? ""),
    companyName: String(data.companyName ?? "Onbekende salon"),
    companyLogoUrl: typeof data.companyLogoUrl === "string" ? data.companyLogoUrl : undefined,
    companyCity: typeof data.companyCity === "string" ? data.companyCity : undefined,
    companyCategories: Array.isArray(data.companyCategories)
      ? (data.companyCategories as string[])
      : undefined,
    serviceId: linkedServiceId,
    serviceName: linkedServiceName,
    category: String(data.category ?? "Overig"),
    title: typeof data.title === "string" ? data.title : undefined,
    caption: typeof data.caption === "string" ? data.caption : undefined,
    hashtags: normalizeHashtags(data.hashtags),
    visibility: data.visibility === "clients_only" ? "clients_only" : "public",
    mediaType,
    videoUrl: rawVideoUrl,
    imageUrl: rawImageUrl,
    thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : undefined,
    sourceVideoUrl: normalizeOptionalString(data.sourceVideoUrl),
    sourceImageUrl: normalizeOptionalString(data.sourceImageUrl),
    cropPreset: normalizeMediaCropPreset(data.cropPreset),
    filterPreset: normalizeMediaFilterPreset(data.filterPreset),
    clipStartSec: normalizeOptionalNonNegativeNumber(data.clipStartSec),
    clipEndSec: normalizeOptionalNonNegativeNumber(data.clipEndSec),
    videoDurationSec: normalizeOptionalNonNegativeNumber(data.videoDurationSec),
    isActive: Boolean(data.isActive),
    creatorRole,
    influencerId,
    influencerName,
    influencerCommissionPercent,
    viewCount: Number(data.viewCount ?? 0) || 0,
    createdAtMs: typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0,
  };
}

function isIndexRequiredError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return code.includes("failed-precondition") || message.includes("requires an index");
}

function sortDescByCreatedAt(items: FeedPost[]): FeedPost[] {
  return [...items].sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

export async function fetchFeed(params: FetchFeedParams = {}): Promise<FetchFeedResult> {
  const { category, companyId, pageSize = 8, lastDoc } = params;

  try {
    let q = companyId
      ? query(
          collection(db, "feed_public"),
          where("isActive", "==", true),
          where("companyId", "==", companyId),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        )
      : category
        ? query(
            collection(db, "feed_public"),
            where("isActive", "==", true),
            where("category", "==", category),
            orderBy("createdAt", "desc"),
            limit(pageSize)
          )
        : query(
            collection(db, "feed_public"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc"),
            limit(pageSize)
          );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => toFeedPost(d.id, d.data()));
    const nextLast = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

    return { items, lastDoc: nextLast, usedFallback: false };
  } catch (error) {
    if (!isIndexRequiredError(error)) throw error;

    const baseQuery = companyId
      ? query(collection(db, "feed_public"), where("companyId", "==", companyId))
      : category
        ? query(collection(db, "feed_public"), where("category", "==", category))
        : query(collection(db, "feed_public"));

    const snap = await getDocs(baseQuery);
    const rows = snap.docs.map((d) => toFeedPost(d.id, d.data()));
    const filtered = rows.filter((x) => x.isActive);
    const items = sortDescByCreatedAt(filtered).slice(0, pageSize);

    // Fallback mode gebruikt geen cursor-paginatie.
    return { items, lastDoc: null, usedFallback: true };
  }
}

export async function fetchMyFeedPosts(companyId: string): Promise<FeedPost[]> {
  try {
    const q = query(
      collection(db, "feed_public"),
      where("companyId", "==", companyId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toFeedPost(d.id, d.data()));
  } catch (error) {
    if (!isIndexRequiredError(error)) throw error;

    const fallbackQuery = query(collection(db, "feed_public"), where("companyId", "==", companyId));
    const snap = await getDocs(fallbackQuery);
    return sortDescByCreatedAt(snap.docs.map((d) => toFeedPost(d.id, d.data())));
  }
}

export async function fetchInfluencerFeedPosts(influencerId: string): Promise<FeedPost[]> {
  const cleanInfluencerId = influencerId.trim();
  if (!cleanInfluencerId) return [];

  try {
    const q = query(
      collection(db, "feed_public"),
      where("influencerId", "==", cleanInfluencerId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toFeedPost(d.id, d.data()));
  } catch (error) {
    if (!isIndexRequiredError(error)) throw error;

    const fallbackQuery = query(collection(db, "feed_public"), where("influencerId", "==", cleanInfluencerId));
    const snap = await getDocs(fallbackQuery);
    return sortDescByCreatedAt(snap.docs.map((d) => toFeedPost(d.id, d.data())));
  }
}

export async function fetchCompanyFeedPublic(companyId: string): Promise<FeedPost[]> {
  try {
    const q = query(
      collection(db, "feed_public"),
      where("companyId", "==", companyId),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toFeedPost(d.id, d.data()));
  } catch (error) {
    if (!isIndexRequiredError(error)) throw error;

    const fallbackQuery = query(collection(db, "feed_public"), where("companyId", "==", companyId));
    const snap = await getDocs(fallbackQuery);
    const rows = snap.docs.map((d) => toFeedPost(d.id, d.data())).filter((x) => x.isActive);
    return sortDescByCreatedAt(rows);
  }
}

export async function addMyFeedPost(companyId: string, payload: AddFeedPostPayload): Promise<void> {
  const companySnap = await getDoc(doc(db, "companies_public", companyId));
  if (!companySnap.exists()) {
    throw new Error("Bedrijfsprofiel ontbreekt. Sla eerst je profiel op.");
  }

  const activeServiceSnap = await getDocs(
    query(
      collection(db, "companies_public", companyId, "services_public"),
      where("isActive", "==", true),
      limit(1)
    )
  );
  if (activeServiceSnap.empty) {
    throw new Error("Plaats minimaal 1 actieve dienst voordat je een feed post plaatst.");
  }

  const mediaType: "video" | "image" = payload.mediaType === "image" ? "image" : "video";
  const videoUrl = String(payload.videoUrl ?? "").trim();
  const imageUrl = String(payload.imageUrl ?? "").trim();
  const sourceVideoUrl = String(payload.sourceVideoUrl ?? videoUrl).trim();
  const sourceImageUrl = String(payload.sourceImageUrl ?? imageUrl).trim();
  const cropPreset = normalizeMediaCropPreset(payload.cropPreset);
  const filterPreset = normalizeMediaFilterPreset(payload.filterPreset);

  if (mediaType === "video" && !videoUrl) {
    throw new Error("Video ontbreekt.");
  }
  if (mediaType === "image" && !imageUrl) {
    throw new Error("Foto ontbreekt.");
  }

  const company = companySnap.data();

  await addDoc(collection(db, "feed_public"), {
    companyId,
    companyName: String(company.name ?? "Onbekende salon"),
    companyLogoUrl: typeof company.logoUrl === "string" ? company.logoUrl : "",
    companyCity: typeof company.city === "string" ? company.city : "",
    companyCategories: Array.isArray(company.categories) ? company.categories : [],
    serviceId: payload.serviceId ?? "",
    serviceName: payload.serviceName ?? "",
    category: payload.category,
    title: payload.title ?? "",
    caption: payload.caption ?? "",
    hashtags: normalizeHashtags(payload.hashtags),
    visibility: payload.visibility ?? "public",
    mediaType,
    videoUrl: mediaType === "video" ? videoUrl : "",
    imageUrl: mediaType === "image" ? imageUrl : "",
    thumbnailUrl: payload.thumbnailUrl ?? (mediaType === "image" ? imageUrl : ""),
    sourceVideoUrl: mediaType === "video" ? sourceVideoUrl : "",
    sourceImageUrl: mediaType === "image" ? sourceImageUrl : "",
    cropPreset,
    filterPreset,
    clipStartSec: mediaType === "video" ? Math.max(0, Number(payload.clipStartSec ?? 0) || 0) : 0,
    clipEndSec: mediaType === "video" ? Math.max(0, Number(payload.clipEndSec ?? 0) || 0) : 0,
    videoDurationSec: mediaType === "video" ? Math.max(0, Number(payload.videoDurationSec ?? 0) || 0) : 0,
    creatorRole: "company",
    influencerId: "",
    influencerName: "",
    influencerCommissionPercent: 0,
    isActive: payload.isActive ?? true,
    viewCount: Number(payload.viewCount ?? 0) || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addInfluencerFeedPost(input: AddInfluencerFeedPostInput): Promise<void> {
  const influencerId = input.influencerId.trim();
  const companyId = input.companyId.trim();
  const payload = input.payload;
  if (!influencerId || !companyId) {
    throw new Error("Onvolledige influencer upload gegevens.");
  }

  const linkedServiceId = String(payload.serviceId ?? "").trim();
  if (!linkedServiceId) {
    throw new Error("Koppel een dienst zodat boekingen via je video gemeten kunnen worden.");
  }

  const companySnap = await getDoc(doc(db, "companies_public", companyId));
  if (!companySnap.exists()) {
    throw new Error("Bedrijf niet gevonden.");
  }

  const serviceSnap = await getDoc(doc(db, "companies_public", companyId, "services_public", linkedServiceId));
  if (!serviceSnap.exists() || !Boolean(serviceSnap.data()?.isActive)) {
    throw new Error("Gekoppelde dienst is niet actief of niet gevonden.");
  }

  const mediaType: "video" | "image" = payload.mediaType === "image" ? "image" : "video";
  const videoUrl = String(payload.videoUrl ?? "").trim();
  const imageUrl = String(payload.imageUrl ?? "").trim();
  const sourceVideoUrl = String(payload.sourceVideoUrl ?? videoUrl).trim();
  const sourceImageUrl = String(payload.sourceImageUrl ?? imageUrl).trim();
  const cropPreset = normalizeMediaCropPreset(payload.cropPreset);
  const filterPreset = normalizeMediaFilterPreset(payload.filterPreset);
  const influencerCommissionPercent =
    normalizeCommissionPercent(payload.influencerCommissionPercent) ?? 5;

  if (mediaType === "video" && !videoUrl) {
    throw new Error("Video ontbreekt.");
  }
  if (mediaType === "image" && !imageUrl) {
    throw new Error("Foto ontbreekt.");
  }

  const company = companySnap.data();

  await addDoc(collection(db, "feed_public"), {
    companyId,
    companyName: String(company.name ?? "Onbekende salon"),
    companyLogoUrl: typeof company.logoUrl === "string" ? company.logoUrl : "",
    companyCity: typeof company.city === "string" ? company.city : "",
    companyCategories: Array.isArray(company.categories) ? company.categories : [],
    serviceId: linkedServiceId,
    serviceName: String(payload.serviceName ?? serviceSnap.data()?.name ?? ""),
    category: payload.category,
    title: payload.title ?? "",
    caption: payload.caption ?? "",
    hashtags: normalizeHashtags(payload.hashtags),
    visibility: payload.visibility ?? "public",
    mediaType,
    videoUrl: mediaType === "video" ? videoUrl : "",
    imageUrl: mediaType === "image" ? imageUrl : "",
    thumbnailUrl: payload.thumbnailUrl ?? (mediaType === "image" ? imageUrl : ""),
    sourceVideoUrl: mediaType === "video" ? sourceVideoUrl : "",
    sourceImageUrl: mediaType === "image" ? sourceImageUrl : "",
    cropPreset,
    filterPreset,
    clipStartSec: mediaType === "video" ? Math.max(0, Number(payload.clipStartSec ?? 0) || 0) : 0,
    clipEndSec: mediaType === "video" ? Math.max(0, Number(payload.clipEndSec ?? 0) || 0) : 0,
    videoDurationSec: mediaType === "video" ? Math.max(0, Number(payload.videoDurationSec ?? 0) || 0) : 0,
    creatorRole: "influencer",
    influencerId,
    influencerName: String(payload.influencerName ?? "").trim(),
    influencerCommissionPercent,
    isActive: payload.isActive ?? true,
    viewCount: Number(payload.viewCount ?? 0) || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMyFeedPost(postId: string, patch: Partial<AddFeedPostPayload>): Promise<void> {
  const nextPatch: Record<string, unknown> = {};

  if (typeof patch.category === "string") nextPatch.category = patch.category;
  if (typeof patch.title === "string") nextPatch.title = patch.title;
  if (typeof patch.caption === "string") nextPatch.caption = patch.caption;
  if (Array.isArray(patch.hashtags)) nextPatch.hashtags = normalizeHashtags(patch.hashtags);
  if (patch.visibility === "public" || patch.visibility === "clients_only") nextPatch.visibility = patch.visibility;
  if (patch.mediaType === "video" || patch.mediaType === "image") nextPatch.mediaType = patch.mediaType;
  if (typeof patch.videoUrl === "string") nextPatch.videoUrl = patch.videoUrl;
  if (typeof patch.imageUrl === "string") nextPatch.imageUrl = patch.imageUrl;
  if (typeof patch.thumbnailUrl === "string") nextPatch.thumbnailUrl = patch.thumbnailUrl;
  if (typeof patch.sourceVideoUrl === "string") nextPatch.sourceVideoUrl = patch.sourceVideoUrl;
  if (typeof patch.sourceImageUrl === "string") nextPatch.sourceImageUrl = patch.sourceImageUrl;
  if (typeof patch.cropPreset === "string") nextPatch.cropPreset = normalizeMediaCropPreset(patch.cropPreset);
  if (typeof patch.filterPreset === "string") nextPatch.filterPreset = normalizeMediaFilterPreset(patch.filterPreset);
  if (typeof patch.clipStartSec === "number" && Number.isFinite(patch.clipStartSec)) {
    nextPatch.clipStartSec = Math.max(0, patch.clipStartSec);
  }
  if (typeof patch.clipEndSec === "number" && Number.isFinite(patch.clipEndSec)) {
    nextPatch.clipEndSec = Math.max(0, patch.clipEndSec);
  }
  if (typeof patch.videoDurationSec === "number" && Number.isFinite(patch.videoDurationSec)) {
    nextPatch.videoDurationSec = Math.max(0, patch.videoDurationSec);
  }
  if (typeof patch.serviceId === "string") nextPatch.serviceId = patch.serviceId;
  if (typeof patch.serviceName === "string") nextPatch.serviceName = patch.serviceName;
  if (typeof patch.isActive === "boolean") nextPatch.isActive = patch.isActive;
  if (typeof patch.viewCount === "number") nextPatch.viewCount = Number(patch.viewCount) || 0;

  await updateDoc(doc(db, "feed_public", postId), {
    ...nextPatch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMyFeedPost(postId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Je sessie is verlopen. Log opnieuw in.");
  }

  const postRef = doc(db, "feed_public", postId);
  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) {
    throw new Error("Deze post bestaat niet meer.");
  }

  try {
    await deleteDoc(postRef);
  } catch (error: any) {
    const code = String(error?.code ?? "");
    if (code.includes("permission-denied")) {
      const ownerUid = currentUser.uid.trim();
      const isAdmin = isRootAdminIdentity({
        uid: ownerUid,
        email: String(currentUser.email ?? ""),
      });
      const adminHint = isAdmin ? "" : " Controleer of je met het juiste bedrijfs- of influencer-account bent ingelogd.";
      throw new Error(`Je hebt geen rechten om deze video te verwijderen.${adminHint}`);
    }
    throw error;
  }
}

export async function syncCompanyBrandingInFeed(companyId: string): Promise<void> {
  const companySnap = await getDoc(doc(db, "companies_public", companyId));
  if (!companySnap.exists()) return;

  const company = companySnap.data();
  const postsSnap = await getDocs(query(collection(db, "feed_public"), where("companyId", "==", companyId)));
  if (postsSnap.empty) return;

  const patch = {
    companyName: String(company.name ?? "Onbekende salon"),
    companyLogoUrl: typeof company.logoUrl === "string" ? company.logoUrl : "",
    companyCity: typeof company.city === "string" ? company.city : "",
    companyCategories: Array.isArray(company.categories) ? company.categories : [],
    updatedAt: serverTimestamp(),
  };

  const docs = postsSnap.docs;
  const batchSize = 450;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const slice = docs.slice(i, i + batchSize);
    slice.forEach((row) => {
      batch.update(row.ref, patch);
    });
    await batch.commit();
  }
}
