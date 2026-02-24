import {
  collection,
  collectionGroup,
  addDoc,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  notifyCompanyOnFollow,
  notifyCompanyOnPostComment,
  notifyCompanyOnCommentLike,
  notifyCustomerOnCommentLike,
  notifyCompanyOnCompanyRating,
  notifyCompanyOnPostLike,
  notifyCompanyOnServiceRating,
} from "./notificationRepo";
import type { AppRole } from "./roles";

const MIN_PROFILE_REVIEW_COUNT = 10;

function combineRatingSummaries(
  summaries: Array<{ avg: number; count: number }>,
  minReviewCount = MIN_PROFILE_REVIEW_COUNT
): { avg: number; count: number; hasEnoughReviews: boolean } {
  let totalCount = 0;
  let weightedTotal = 0;

  summaries.forEach((summary) => {
    const count = Number(summary.count ?? 0);
    const avg = Number(summary.avg ?? 0);
    if (!Number.isFinite(count) || count <= 0) return;
    if (!Number.isFinite(avg) || avg <= 0) return;
    totalCount += count;
    weightedTotal += avg * count;
  });

  if (!totalCount || weightedTotal <= 0) {
    return { avg: 0, count: 0, hasEnoughReviews: false };
  }

  return {
    avg: Number((weightedTotal / totalCount).toFixed(1)),
    count: totalCount,
    hasEnoughReviews: totalCount >= minReviewCount,
  };
}

export async function isFollowingCompany(companyId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "companies_public", companyId, "followers", uid));
  return snap.exists();
}

export async function toggleFollowCompany(
  companyId: string,
  uid: string,
  role: AppRole
): Promise<boolean> {
  const ref = doc(db, "companies_public", companyId, "followers", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }

  await setDoc(ref, {
    userId: uid,
    role,
    createdAt: serverTimestamp(),
  });
  await notifyCompanyOnFollow({
    companyId,
    actorId: uid,
    actorRole: role,
    followed: true,
  }).catch(() => null);
  return true;
}

export async function getCompanyFollowersCount(companyId: string): Promise<number> {
  const countSnap = await getCountFromServer(collection(db, "companies_public", companyId, "followers"));
  return countSnap.data().count;
}

export async function getPostLikeCount(postId: string): Promise<number> {
  const countSnap = await getCountFromServer(collection(db, "feed_public", postId, "likes"));
  return countSnap.data().count;
}

export type FeedComment = {
  id: string;
  userId: string;
  role: AppRole;
  text: string;
  authorName?: string;
  createdAtMs?: number;
};

function toFeedComment(id: string, data: Record<string, unknown>): FeedComment {
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  const roleRaw = String(data.role ?? "customer");
  const role: AppRole =
    roleRaw === "company" || roleRaw === "employee" || roleRaw === "influencer" || roleRaw === "admin"
      ? roleRaw
      : "customer";

  return {
    id,
    userId: String(data.userId ?? ""),
    role,
    text: String(data.text ?? ""),
    authorName: typeof data.authorName === "string" ? data.authorName : undefined,
    createdAtMs: typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0,
  };
}

export async function fetchPostComments(postId: string, take = 30): Promise<FeedComment[]> {
  const q = query(
    collection(db, "feed_public", postId, "comments"),
    orderBy("createdAt", "desc"),
    limit(take)
  );
  const snap = await getDocs(q);
  return snap.docs.map((row) => toFeedComment(row.id, row.data()));
}

export async function addPostComment(
  postId: string,
  uid: string,
  role: AppRole,
  text: string,
  authorName?: string
): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    throw new Error("Typ eerst een reactie.");
  }

  const rowRef = await addDoc(collection(db, "feed_public", postId, "comments"), {
    userId: uid,
    role,
    text: clean,
    authorName: authorName?.trim() || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await notifyCompanyOnPostComment({
    postId,
    commentId: rowRef.id,
    actorId: uid,
    actorRole: role,
  }).catch(() => null);
}

export async function deletePostComment(postId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, "feed_public", postId, "comments", commentId));
}

export async function getPostCommentCount(postId: string): Promise<number> {
  const countSnap = await getCountFromServer(collection(db, "feed_public", postId, "comments"));
  return countSnap.data().count;
}

export async function getCommentLikeCount(postId: string, commentId: string): Promise<number> {
  const countSnap = await getCountFromServer(
    collection(db, "feed_public", postId, "comments", commentId, "likes")
  );
  return countSnap.data().count;
}

export async function isCommentLiked(postId: string, commentId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "feed_public", postId, "comments", commentId, "likes", uid));
  return snap.exists();
}

export async function toggleCommentLike(
  postId: string,
  commentId: string,
  uid: string,
  role: AppRole
): Promise<boolean> {
  const ref = doc(db, "feed_public", postId, "comments", commentId, "likes", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await deleteDoc(ref);
    await notifyCompanyOnCommentLike({
      postId,
      commentId,
      actorId: uid,
      actorRole: role,
      liked: false,
    }).catch(() => null);
    return false;
  }

  await setDoc(ref, {
    userId: uid,
    role,
    createdAt: serverTimestamp(),
  });
  const commentSnap = await getDoc(doc(db, "feed_public", postId, "comments", commentId)).catch(() => null);
  const commentData = commentSnap?.exists() ? (commentSnap.data() as Record<string, unknown>) : {};
  const ownerId = String(commentData.userId ?? "").trim();
  const ownerRole = String(commentData.role ?? "customer").trim().toLowerCase();

  await notifyCompanyOnCommentLike({
    postId,
    commentId,
    actorId: uid,
    actorRole: role,
    liked: true,
  }).catch(() => null);

  if (ownerId && ownerId !== uid && ownerRole !== "company") {
    await notifyCustomerOnCommentLike({
      customerId: ownerId,
      actorId: uid,
      actorRole: role,
      postId,
      commentId,
      liked: true,
    }).catch(() => null);
  }
  return true;
}

export async function isPostLiked(postId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "feed_public", postId, "likes", uid));
  return snap.exists();
}

export async function togglePostLike(postId: string, uid: string, role: AppRole): Promise<boolean> {
  const ref = doc(db, "feed_public", postId, "likes", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await deleteDoc(ref);
    await notifyCompanyOnPostLike({
      postId,
      actorId: uid,
      actorRole: role,
      liked: false,
    }).catch(() => null);
    return false;
  }

  await setDoc(ref, {
    userId: uid,
    role,
    createdAt: serverTimestamp(),
  });
  await notifyCompanyOnPostLike({
    postId,
    actorId: uid,
    actorRole: role,
    liked: true,
  }).catch(() => null);
  return true;
}

export async function rateCompany(companyId: string, uid: string, score: number): Promise<void> {
  if (score < 1 || score > 5) {
    throw new Error("Score moet tussen 1 en 5 zijn.");
  }

  await setDoc(doc(db, "companies_public", companyId, "ratings", uid), {
    userId: uid,
    score,
    updatedAt: serverTimestamp(),
  });

  await notifyCompanyOnCompanyRating({
    companyId,
    actorId: uid,
    actorRole: "customer",
    score,
  }).catch(() => null);
}

export async function getMyCompanyRating(companyId: string, uid: string): Promise<number | null> {
  const snap = await getDoc(doc(db, "companies_public", companyId, "ratings", uid));
  if (!snap.exists()) return null;
  return Number(snap.data().score ?? 0) || null;
}

export async function getCompanyRating(companyId: string): Promise<{ avg: number; count: number }> {
  const servicesSnap = await getDocs(collection(db, "companies_public", companyId, "services_public"));

  if (!servicesSnap.docs.length) {
    return { avg: 0, count: 0 };
  }

  const summaries = await Promise.all(
    servicesSnap.docs.map((serviceDoc) => getServiceRating(companyId, serviceDoc.id))
  );
  const combined = combineRatingSummaries(summaries);

  return { avg: combined.avg, count: combined.count };
}

export async function rateService(
  companyId: string,
  serviceId: string,
  uid: string,
  score: number
): Promise<void> {
  if (score < 1 || score > 5) {
    throw new Error("Score moet tussen 1 en 5 zijn.");
  }

  await setDoc(doc(db, "companies_public", companyId, "services_public", serviceId, "ratings", uid), {
    userId: uid,
    score,
    updatedAt: serverTimestamp(),
  });

  const serviceSnap = await getDoc(doc(db, "companies_public", companyId, "services_public", serviceId));
  const serviceName = serviceSnap.exists() ? String(serviceSnap.data().name ?? "") : "";

  await notifyCompanyOnServiceRating({
    companyId,
    serviceId,
    serviceName,
    actorId: uid,
    actorRole: "customer",
    score,
  }).catch(() => null);
}

export async function getMyServiceRating(
  companyId: string,
  serviceId: string,
  uid: string
): Promise<number | null> {
  const snap = await getDoc(doc(db, "companies_public", companyId, "services_public", serviceId, "ratings", uid));
  if (!snap.exists()) return null;
  return Number(snap.data().score ?? 0) || null;
}

export async function getServiceRating(
  companyId: string,
  serviceId: string
): Promise<{ avg: number; count: number }> {
  const snap = await getDocs(collection(db, "companies_public", companyId, "services_public", serviceId, "ratings"));
  const values = snap.docs.map((d) => Number(d.data().score ?? 0)).filter((v) => Number.isFinite(v) && v > 0);

  if (!values.length) return { avg: 0, count: 0 };

  const total = values.reduce((acc, v) => acc + v, 0);
  return {
    avg: Number((total / values.length).toFixed(1)),
    count: values.length,
  };
}

export async function getCompanyProfileRating(
  companyId: string,
  minReviewCount = MIN_PROFILE_REVIEW_COUNT
): Promise<{ avg: number; count: number; hasEnoughReviews: boolean; minReviewCount: number }> {
  const summary = await getCompanyRating(companyId);
  const hasEnoughReviews = summary.count >= minReviewCount;

  return {
    avg: summary.avg,
    count: summary.count,
    hasEnoughReviews,
    minReviewCount,
  };
}

export async function getCompanyTotalLikes(companyId: string): Promise<number> {
  const postsSnap = await getDocs(query(collection(db, "feed_public"), where("companyId", "==", companyId)));
  const counts = await Promise.all(postsSnap.docs.map((d) => getPostLikeCount(d.id)));
  return counts.reduce((acc, v) => acc + v, 0);
}

export async function getMyFollowingCount(uid: string): Promise<number> {
  const q = query(collectionGroup(db, "followers"), where("userId", "==", uid));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count;
}

export async function getMyLikesGivenCount(uid: string): Promise<number> {
  const q = query(collectionGroup(db, "likes"), where("userId", "==", uid));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count;
}

export async function getMyRatingsGivenCount(uid: string): Promise<number> {
  const q = query(collectionGroup(db, "ratings"), where("userId", "==", uid));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count;
}
