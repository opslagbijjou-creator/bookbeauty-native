import {
  addDoc,
  collection,
  doc,
  DocumentData,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppRole } from "./roles";

export type CompanyNotificationType =
  | "post_like"
  | "comment_like"
  | "service_rating"
  | "company_rating"
  | "booking_request"
  | "new_follower";

export type CompanyNotification = {
  id: string;
  companyId: string;
  actorId: string;
  actorRole: AppRole;
  type: CompanyNotificationType;
  title: string;
  body: string;
  postId?: string;
  commentId?: string;
  serviceId?: string;
  bookingId?: string;
  score?: number;
  read: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

function roleLabel(role: AppRole): string {
  if (role === "company") return "Een bedrijf";
  if (role === "employee") return "Een medewerker";
  if (role === "admin") return "Admin";
  return "Een klant";
}

function toNotification(id: string, data: Record<string, unknown>): CompanyNotification {
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  const updatedAt = data.updatedAt as { toMillis?: () => number } | undefined;
  const roleRaw = String(data.actorRole ?? "customer");
  const actorRole: AppRole =
    roleRaw === "company" || roleRaw === "employee" || roleRaw === "admin" ? roleRaw : "customer";
  const typeRaw = String(data.type ?? "post_like");
  const type: CompanyNotificationType =
    typeRaw === "comment_like" ||
    typeRaw === "service_rating" ||
    typeRaw === "company_rating" ||
    typeRaw === "booking_request" ||
    typeRaw === "new_follower"
      ? typeRaw
      : "post_like";

  return {
    id,
    companyId: String(data.companyId ?? ""),
    actorId: String(data.actorId ?? ""),
    actorRole,
    type,
    title: String(data.title ?? ""),
    body: String(data.body ?? ""),
    postId: typeof data.postId === "string" ? data.postId : undefined,
    commentId: typeof data.commentId === "string" ? data.commentId : undefined,
    serviceId: typeof data.serviceId === "string" ? data.serviceId : undefined,
    bookingId: typeof data.bookingId === "string" ? data.bookingId : undefined,
    score: typeof data.score === "number" ? data.score : undefined,
    read: Boolean(data.read),
    createdAtMs: typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0,
    updatedAtMs: typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : 0,
  };
}

async function createNotification(
  companyId: string,
  payload: Omit<CompanyNotification, "id" | "companyId" | "createdAtMs" | "updatedAtMs" | "read"> & {
    companyId?: string;
  }
): Promise<void> {
  const data: Record<string, unknown> = {
    companyId,
    actorId: payload.actorId,
    actorRole: payload.actorRole,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.postId) data.postId = payload.postId;
  if (payload.commentId) data.commentId = payload.commentId;
  if (payload.serviceId) data.serviceId = payload.serviceId;
  if (payload.bookingId) data.bookingId = payload.bookingId;
  if (typeof payload.score === "number") data.score = payload.score;

  await addDoc(collection(db, "companies", companyId, "notifications"), data);
}

export async function notifyCompanyOnPostLike(params: {
  postId: string;
  actorId: string;
  actorRole: AppRole;
  liked: boolean;
}): Promise<void> {
  const { postId, actorId, actorRole, liked } = params;
  const postSnap = await getDoc(doc(db, "feed_public", postId));
  if (!postSnap.exists()) return;

  const post = postSnap.data();
  const companyId = String(post.companyId ?? "");
  if (!companyId || companyId === actorId) return;
  if (!liked) return;

  await createNotification(companyId, {
    actorId,
    actorRole,
    type: "post_like",
    title: "Nieuwe like",
    body: `${roleLabel(actorRole)} heeft je video geliket.`,
    postId,
  });
}

export async function notifyCompanyOnCommentLike(params: {
  postId: string;
  commentId: string;
  actorId: string;
  actorRole: AppRole;
  liked: boolean;
}): Promise<void> {
  const { postId, commentId, actorId, actorRole, liked } = params;
  const commentSnap = await getDoc(doc(db, "feed_public", postId, "comments", commentId));
  if (!commentSnap.exists()) return;

  const comment = commentSnap.data();
  const ownerId = String(comment.userId ?? "");
  const ownerRole = String(comment.role ?? "customer");
  if (!ownerId || ownerRole !== "company" || ownerId === actorId) return;
  if (!liked) return;

  await createNotification(ownerId, {
    actorId,
    actorRole,
    type: "comment_like",
    title: "Comment like",
    body: `${roleLabel(actorRole)} likete je reactie.`,
    postId,
    commentId,
  });
}

export async function notifyCompanyOnServiceRating(params: {
  companyId: string;
  serviceId: string;
  serviceName?: string;
  actorId: string;
  actorRole: AppRole;
  score: number;
}): Promise<void> {
  const { companyId, serviceId, serviceName, actorId, actorRole, score } = params;
  if (!companyId || companyId === actorId) return;

  const label = serviceName?.trim() ? serviceName.trim() : "een dienst";
  await createNotification(companyId, {
    actorId,
    actorRole,
    type: "service_rating",
    title: "Nieuwe beoordeling",
    body: `${roleLabel(actorRole)} gaf ${score} sterren voor ${label}.`,
    serviceId,
    score,
  });
}

export async function notifyCompanyOnCompanyRating(params: {
  companyId: string;
  actorId: string;
  actorRole: AppRole;
  score: number;
}): Promise<void> {
  const { companyId, actorId, actorRole, score } = params;
  if (!companyId || companyId === actorId) return;

  await createNotification(companyId, {
    actorId,
    actorRole,
    type: "company_rating",
    title: "Nieuwe profielscore",
    body: `${roleLabel(actorRole)} gaf je bedrijf ${score} sterren.`,
    score,
  });
}

export async function notifyCompanyOnBookingRequest(params: {
  companyId: string;
  customerId: string;
  customerName?: string;
  serviceId: string;
  bookingId: string;
  isAutoConfirmed?: boolean;
}): Promise<void> {
  const { companyId, customerId, customerName, serviceId, bookingId, isAutoConfirmed = false } = params;
  if (!companyId || !customerId || !bookingId) return;

  const name = customerName?.trim() ? customerName.trim() : "Een klant";
  await createNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_request",
    title: isAutoConfirmed ? "Nieuwe boeking" : "Nieuwe boekingsaanvraag",
    body: isAutoConfirmed
      ? `${name} heeft een boeking geplaatst (auto-bevestigd).`
      : `${name} heeft een nieuwe aanvraag gestuurd.`,
    serviceId,
    bookingId,
  });
}

export async function notifyCompanyOnFollow(params: {
  companyId: string;
  actorId: string;
  actorRole: AppRole;
  followed: boolean;
}): Promise<void> {
  const { companyId, actorId, actorRole, followed } = params;
  if (!followed) return;
  if (!companyId || !actorId || companyId === actorId) return;

  await createNotification(companyId, {
    actorId,
    actorRole,
    type: "new_follower",
    title: "Nieuwe volger",
    body: `${roleLabel(actorRole)} volgt je salon.`,
  });
}

export async function fetchMyCompanyNotifications(
  companyId: string,
  take = 80
): Promise<CompanyNotification[]> {
  const q = query(
    collection(db, "companies", companyId, "notifications"),
    orderBy("createdAt", "desc"),
    limit(take)
  );
  const snap = await getDocs(q);
  return snap.docs.map((row) => toNotification(row.id, row.data()));
}

export function subscribeMyCompanyNotifications(
  companyId: string,
  onData: (items: CompanyNotification[]) => void,
  onError?: (error: unknown) => void,
  take = 80
): Unsubscribe {
  const q = query(
    collection(db, "companies", companyId, "notifications"),
    orderBy("createdAt", "desc"),
    limit(take)
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row: QueryDocumentSnapshot<DocumentData>) => toNotification(row.id, row.data()));
      onData(rows);
    },
    (error) => onError?.(error)
  );
}

export async function getMyUnreadNotificationsCount(companyId: string): Promise<number> {
  const q = query(collection(db, "companies", companyId, "notifications"), where("read", "==", false));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count;
}

export function subscribeMyUnreadNotificationsCount(
  companyId: string,
  onData: (count: number) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(collection(db, "companies", companyId, "notifications"), where("read", "==", false));
  return onSnapshot(
    q,
    (snap) => onData(snap.size),
    (error) => onError?.(error)
  );
}

export async function markNotificationRead(companyId: string, notificationId: string): Promise<void> {
  await updateDoc(doc(db, "companies", companyId, "notifications", notificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(companyId: string): Promise<void> {
  const q = query(
    collection(db, "companies", companyId, "notifications"),
    where("read", "==", false),
    limit(250)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((row) => {
    batch.update(row.ref, {
      read: true,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
