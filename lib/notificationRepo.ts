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
import { sendPushToUser } from "./pushRepo";

export type CompanyNotificationType =
  | "post_like"
  | "post_comment"
  | "comment_like"
  | "service_rating"
  | "company_rating"
  | "booking_request"
  | "booking_checked_in"
  | "booking_completed"
  | "booking_no_show"
  | "booking_cancelled"
  | "booking_proposal_accepted"
  | "booking_proposal_declined"
  | "booking_reschedule_requested"
  | "new_follower";

export type CustomerNotificationType =
  | "booking_created"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_checked_in"
  | "booking_completed"
  | "booking_no_show"
  | "booking_time_proposed"
  | "booking_reschedule_approved"
  | "booking_reschedule_declined"
  | "booking_payment_pending"
  | "booking_payment_failed"
  | "booking_payment_cancelled"
  | "booking_payment_expired"
  | "comment_like";

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

export type CustomerNotification = {
  id: string;
  customerId: string;
  actorId: string;
  actorRole: AppRole;
  type: CustomerNotificationType;
  title: string;
  body: string;
  companyId?: string;
  companyName?: string;
  serviceId?: string;
  bookingId?: string;
  postId?: string;
  commentId?: string;
  read: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

function roleLabel(role: AppRole): string {
  if (role === "company") return "Een bedrijf";
  if (role === "employee") return "Een medewerker";
  if (role === "influencer") return "Een influencer";
  if (role === "admin") return "Admin";
  return "Een klant";
}

function normalizeActorRole(value: unknown): AppRole {
  const roleRaw = String(value ?? "customer");
  return roleRaw === "company" ||
    roleRaw === "employee" ||
    roleRaw === "influencer" ||
    roleRaw === "admin"
    ? roleRaw
    : "customer";
}

function toMillis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
}

function normalizeCompanyNotificationType(value: unknown): CompanyNotificationType {
  const typeRaw = String(value ?? "post_like");
  return typeRaw === "booking_checked_in" ||
    typeRaw === "booking_completed" ||
    typeRaw === "booking_no_show" ||
    typeRaw === "post_comment" ||
    typeRaw === "comment_like" ||
    typeRaw === "service_rating" ||
    typeRaw === "company_rating" ||
    typeRaw === "booking_request" ||
    typeRaw === "booking_cancelled" ||
    typeRaw === "booking_proposal_accepted" ||
    typeRaw === "booking_proposal_declined" ||
    typeRaw === "booking_reschedule_requested" ||
    typeRaw === "new_follower"
    ? typeRaw
    : "post_like";
}

function normalizeCustomerNotificationType(value: unknown): CustomerNotificationType {
  const typeRaw = String(value ?? "booking_created");
  return typeRaw === "booking_confirmed" ||
    typeRaw === "booking_cancelled" ||
    typeRaw === "booking_checked_in" ||
    typeRaw === "booking_completed" ||
    typeRaw === "booking_no_show" ||
    typeRaw === "booking_time_proposed" ||
    typeRaw === "booking_reschedule_approved" ||
    typeRaw === "booking_reschedule_declined" ||
    typeRaw === "booking_payment_pending" ||
    typeRaw === "booking_payment_failed" ||
    typeRaw === "booking_payment_cancelled" ||
    typeRaw === "booking_payment_expired" ||
    typeRaw === "comment_like"
    ? typeRaw
    : "booking_created";
}

function shouldPlaySoundForCompanyNotification(type: CompanyNotificationType): boolean {
  return type === "booking_request";
}

function shouldPlaySoundForCustomerNotification(type: CustomerNotificationType): boolean {
  return type === "booking_created" || type === "booking_confirmed";
}

function toNotification(id: string, data: Record<string, unknown>): CompanyNotification {
  return {
    id,
    companyId: String(data.companyId ?? ""),
    actorId: String(data.actorId ?? ""),
    actorRole: normalizeActorRole(data.actorRole),
    type: normalizeCompanyNotificationType(data.type),
    title: String(data.title ?? ""),
    body: String(data.body ?? ""),
    postId: typeof data.postId === "string" ? data.postId : undefined,
    commentId: typeof data.commentId === "string" ? data.commentId : undefined,
    serviceId: typeof data.serviceId === "string" ? data.serviceId : undefined,
    bookingId: typeof data.bookingId === "string" ? data.bookingId : undefined,
    score: typeof data.score === "number" ? data.score : undefined,
    read: Boolean(data.read),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

function toCustomerNotification(id: string, data: Record<string, unknown>): CustomerNotification {
  return {
    id,
    customerId: String(data.customerId ?? ""),
    actorId: String(data.actorId ?? ""),
    actorRole: normalizeActorRole(data.actorRole),
    type: normalizeCustomerNotificationType(data.type),
    title: String(data.title ?? ""),
    body: String(data.body ?? ""),
    companyId: typeof data.companyId === "string" ? data.companyId : undefined,
    companyName: typeof data.companyName === "string" ? data.companyName : undefined,
    serviceId: typeof data.serviceId === "string" ? data.serviceId : undefined,
    bookingId: typeof data.bookingId === "string" ? data.bookingId : undefined,
    postId: typeof data.postId === "string" ? data.postId : undefined,
    commentId: typeof data.commentId === "string" ? data.commentId : undefined,
    read: Boolean(data.read),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

async function createCompanyNotification(
  companyId: string,
  payload: {
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

  const rowRef = await addDoc(collection(db, "companies", companyId, "notifications"), data);
  void sendPushToUser(companyId, {
    title: payload.title,
    body: payload.body,
    playSound: shouldPlaySoundForCompanyNotification(payload.type),
    data: {
      notificationId: rowRef.id,
      notificationType: payload.type,
      role: "company",
      companyId,
      bookingId: payload.bookingId ?? "",
      postId: payload.postId ?? "",
      serviceId: payload.serviceId ?? "",
    },
  }).catch(() => null);
}

async function createCustomerNotification(
  customerId: string,
  payload: {
    actorId: string;
    actorRole: AppRole;
    type: CustomerNotificationType;
    title: string;
    body: string;
    companyId?: string;
    companyName?: string;
    serviceId?: string;
    bookingId?: string;
    postId?: string;
    commentId?: string;
  }
): Promise<void> {
  const data: Record<string, unknown> = {
    customerId,
    actorId: payload.actorId,
    actorRole: payload.actorRole,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (payload.companyId) data.companyId = payload.companyId;
  if (payload.companyName) data.companyName = payload.companyName;
  if (payload.serviceId) data.serviceId = payload.serviceId;
  if (payload.bookingId) data.bookingId = payload.bookingId;
  if (payload.postId) data.postId = payload.postId;
  if (payload.commentId) data.commentId = payload.commentId;

  const rowRef = await addDoc(collection(db, "users", customerId, "notifications"), data);
  void sendPushToUser(customerId, {
    title: payload.title,
    body: payload.body,
    playSound: shouldPlaySoundForCustomerNotification(payload.type),
    data: {
      notificationId: rowRef.id,
      notificationType: payload.type,
      role: "customer",
      customerId,
      companyId: payload.companyId ?? "",
      bookingId: payload.bookingId ?? "",
      serviceId: payload.serviceId ?? "",
      postId: payload.postId ?? "",
      commentId: payload.commentId ?? "",
    },
  }).catch(() => null);
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

  await createCompanyNotification(companyId, {
    actorId,
    actorRole,
    type: "post_like",
    title: "Nieuwe like",
    body: `${roleLabel(actorRole)} heeft je video geliket.`,
    postId,
  });
}

export async function notifyCompanyOnPostComment(params: {
  postId: string;
  commentId: string;
  actorId: string;
  actorRole: AppRole;
}): Promise<void> {
  const { postId, commentId, actorId, actorRole } = params;
  const postSnap = await getDoc(doc(db, "feed_public", postId));
  if (!postSnap.exists()) return;

  const post = postSnap.data();
  const companyId = String(post.companyId ?? "");
  if (!companyId || companyId === actorId) return;

  await createCompanyNotification(companyId, {
    actorId,
    actorRole,
    type: "post_comment",
    title: "Nieuwe reactie",
    body: `${roleLabel(actorRole)} reageerde op je video.`,
    postId,
    commentId,
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

  await createCompanyNotification(ownerId, {
    actorId,
    actorRole,
    type: "comment_like",
    title: "Comment like",
    body: `${roleLabel(actorRole)} likete je reactie.`,
    postId,
    commentId,
  });
}

export async function notifyCustomerOnCommentLike(params: {
  customerId: string;
  actorId: string;
  actorRole: AppRole;
  postId: string;
  commentId: string;
  liked: boolean;
}): Promise<void> {
  const { customerId, actorId, actorRole, postId, commentId, liked } = params;
  if (!liked) return;
  if (!customerId || customerId === actorId) return;

  await createCustomerNotification(customerId, {
    actorId,
    actorRole,
    type: "comment_like",
    title: "Je reactie is geliket",
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
  await createCompanyNotification(companyId, {
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

  await createCompanyNotification(companyId, {
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
  await createCompanyNotification(companyId, {
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

export async function notifyCompanyOnBookingCancelledByCustomer(params: {
  companyId: string;
  customerId: string;
  customerName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  feePercent?: number;
}): Promise<void> {
  const { companyId, customerId, customerName, serviceId, serviceName, bookingId, feePercent = 0 } = params;
  if (!companyId || !customerId || !bookingId) return;

  const name = customerName?.trim() ? customerName.trim() : "Een klant";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "een afspraak";
  const feeNote = feePercent > 0 ? ` (${feePercent}% annuleringsfee)` : "";
  await createCompanyNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_cancelled",
    title: "Boeking geannuleerd",
    body: `${name} heeft ${serviceLabel} geannuleerd${feeNote}.`,
    serviceId,
    bookingId,
  });
}

export async function notifyCompanyOnBookingProposalDecisionByCustomer(params: {
  companyId: string;
  customerId: string;
  customerName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  decision: "accepted" | "declined";
}): Promise<void> {
  const { companyId, customerId, customerName, serviceId, serviceName, bookingId, decision } = params;
  if (!companyId || !customerId || !bookingId) return;

  const name = customerName?.trim() ? customerName.trim() : "De klant";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "de afspraak";
  await createCompanyNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: decision === "accepted" ? "booking_proposal_accepted" : "booking_proposal_declined",
    title: decision === "accepted" ? "Tijdvoorstel geaccepteerd" : "Tijdvoorstel geweigerd",
    body:
      decision === "accepted"
        ? `${name} heeft je nieuwe tijd voor ${serviceLabel} geaccepteerd.`
        : `${name} heeft je tijdvoorstel voor ${serviceLabel} geweigerd.`,
    serviceId,
    bookingId,
  });
}

export async function notifyCompanyOnRescheduleRequestByCustomer(params: {
  companyId: string;
  customerId: string;
  customerName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  proposedStartAtMs: number;
}): Promise<void> {
  const { companyId, customerId, customerName, serviceId, serviceName, bookingId, proposedStartAtMs } = params;
  if (!companyId || !customerId || !bookingId) return;

  const name = customerName?.trim() ? customerName.trim() : "Een klant";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "de afspraak";
  await createCompanyNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_reschedule_requested",
    title: "Verplaatsing aangevraagd",
    body: `${name} wil ${serviceLabel} verplaatsen naar ${formatMoment(proposedStartAtMs)}.`,
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

  await createCompanyNotification(companyId, {
    actorId,
    actorRole,
    type: "new_follower",
    title: "Nieuwe volger",
    body: `${roleLabel(actorRole)} volgt je salon.`,
  });
}

function formatMoment(timestampMs: number): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return "binnenkort";
  return new Date(timestampMs).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function notifyCustomerOnBookingCreated(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  status: "pending" | "confirmed";
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId, status } = params;
  if (!customerId || !bookingId) return;

  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je dienst";
  await createCustomerNotification(customerId, {
    actorId: customerId,
    actorRole: "customer",
    type: status === "confirmed" ? "booking_confirmed" : "booking_created",
    title: status === "confirmed" ? "Boeking bevestigd" : "Boeking geplaatst",
    body:
      status === "confirmed"
        ? `Je afspraak voor ${serviceLabel} bij ${companyLabel} is direct bevestigd.`
        : `Je afspraak voor ${serviceLabel} bij ${companyLabel} is geplaatst en wacht op goedkeuring.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnBookingPaymentPending(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId } = params;
  if (!customerId || !bookingId) return;

  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je dienst";
  await createCustomerNotification(customerId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_payment_pending",
    title: "Rond je betaling af",
    body: `Je boeking voor ${serviceLabel} bij ${companyLabel} staat klaar. Betaal om door te gaan.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnBookingStatusByCompany(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  status: "confirmed" | "cancelled";
  actorId?: string;
  actorRole?: AppRole;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId, status, actorId, actorRole } = params;
  if (!customerId || !companyId || !bookingId) return;

  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je afspraak";
  const actorIdToStore = actorId?.trim() || companyId;
  const actorRoleToStore = actorRole ?? "company";
  await createCustomerNotification(customerId, {
    actorId: actorIdToStore,
    actorRole: actorRoleToStore,
    type: status === "confirmed" ? "booking_confirmed" : "booking_cancelled",
    title: status === "confirmed" ? "Afspraak goedgekeurd" : "Afspraak geannuleerd",
    body:
      status === "confirmed"
        ? `${companyLabel} heeft ${serviceLabel} bevestigd.`
        : `${companyLabel} heeft ${serviceLabel} geannuleerd.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnBookingProposalByCompany(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  proposedStartAtMs: number;
  actorId?: string;
  actorRole?: AppRole;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId, proposedStartAtMs, actorId, actorRole } =
    params;
  if (!customerId || !companyId || !bookingId) return;

  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je afspraak";
  const actorIdToStore = actorId?.trim() || companyId;
  const actorRoleToStore = actorRole ?? "company";
  await createCustomerNotification(customerId, {
    actorId: actorIdToStore,
    actorRole: actorRoleToStore,
    type: "booking_time_proposed",
    title: "Nieuw tijdvoorstel",
    body: `${companyLabel} stelde voor ${serviceLabel} een nieuw tijdstip voor: ${formatMoment(proposedStartAtMs)}.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnRescheduleDecisionByCompany(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
  decision: "approved" | "declined";
  actorId?: string;
  actorRole?: AppRole;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId, decision, actorId, actorRole } = params;
  if (!customerId || !companyId || !bookingId) return;

  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je afspraak";
  const actorIdToStore = actorId?.trim() || companyId;
  const actorRoleToStore = actorRole ?? "company";
  await createCustomerNotification(customerId, {
    actorId: actorIdToStore,
    actorRole: actorRoleToStore,
    type: decision === "approved" ? "booking_reschedule_approved" : "booking_reschedule_declined",
    title: decision === "approved" ? "Verplaatsing goedgekeurd" : "Verplaatsing afgewezen",
    body:
      decision === "approved"
        ? `${companyLabel} heeft je verplaatsingsverzoek voor ${serviceLabel} goedgekeurd.`
        : `${companyLabel} heeft je verplaatsingsverzoek voor ${serviceLabel} afgewezen.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCompanyOnBookingCheckedIn(params: {
  companyId: string;
  customerId: string;
  customerName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { companyId, customerId, customerName, serviceId, serviceName, bookingId } = params;
  if (!companyId || !customerId || !bookingId) return;
  const name = customerName?.trim() ? customerName.trim() : "Een klant";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "de afspraak";

  await createCompanyNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_checked_in",
    title: "Klant heeft ingecheckt",
    body: `${name} heeft ingecheckt voor ${serviceLabel}.`,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnBookingCheckedIn(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId } = params;
  if (!customerId || !bookingId) return;
  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je afspraak";

  await createCustomerNotification(customerId, {
    actorId: companyId,
    actorRole: "company",
    type: "booking_checked_in",
    title: "Aankomst bevestigd",
    body: `Je bent ingecheckt voor ${serviceLabel} bij ${companyLabel}.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCompanyOnBookingCompleted(params: {
  companyId: string;
  customerId: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { companyId, customerId, serviceId, serviceName, bookingId } = params;
  if (!companyId || !bookingId) return;
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "de afspraak";
  await createCompanyNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_completed",
    title: "Behandeling afgerond",
    body: `${serviceLabel} is afgerond en klaar voor afronding in je administratie.`,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnBookingCompleted(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId } = params;
  if (!customerId || !bookingId) return;
  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je afspraak";
  await createCustomerNotification(customerId, {
    actorId: companyId,
    actorRole: "company",
    type: "booking_completed",
    title: "Afspraak afgerond",
    body: `${serviceLabel} bij ${companyLabel} is afgerond. Bedankt voor je bezoek.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
  });
}

export async function notifyCompanyOnBookingNoShow(params: {
  companyId: string;
  customerId: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { companyId, customerId, serviceId, serviceName, bookingId } = params;
  if (!companyId || !bookingId) return;
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "de afspraak";
  await createCompanyNotification(companyId, {
    actorId: customerId,
    actorRole: "customer",
    type: "booking_no_show",
    title: "No-show geregistreerd",
    body: `No-show gemeld voor ${serviceLabel}.`,
    serviceId,
    bookingId,
  });
}

export async function notifyCustomerOnBookingNoShow(params: {
  customerId: string;
  companyId: string;
  companyName?: string;
  serviceId: string;
  serviceName?: string;
  bookingId: string;
}): Promise<void> {
  const { customerId, companyId, companyName, serviceId, serviceName, bookingId } = params;
  if (!customerId || !bookingId) return;
  const companyLabel = companyName?.trim() ? companyName.trim() : "de salon";
  const serviceLabel = serviceName?.trim() ? serviceName.trim() : "je afspraak";
  await createCustomerNotification(customerId, {
    actorId: companyId,
    actorRole: "company",
    type: "booking_no_show",
    title: "No-show gemeld",
    body: `Er is een no-show gemeld voor ${serviceLabel} bij ${companyLabel}.`,
    companyId,
    companyName,
    serviceId,
    bookingId,
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

export async function fetchMyCustomerNotifications(
  customerId: string,
  take = 80
): Promise<CustomerNotification[]> {
  const q = query(
    collection(db, "users", customerId, "notifications"),
    orderBy("createdAt", "desc"),
    limit(take)
  );
  const snap = await getDocs(q);
  return snap.docs.map((row) => toCustomerNotification(row.id, row.data()));
}

export function subscribeMyCustomerNotifications(
  customerId: string,
  onData: (items: CustomerNotification[]) => void,
  onError?: (error: unknown) => void,
  take = 80
): Unsubscribe {
  const q = query(
    collection(db, "users", customerId, "notifications"),
    orderBy("createdAt", "desc"),
    limit(take)
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row: QueryDocumentSnapshot<DocumentData>) => toCustomerNotification(row.id, row.data()));
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

export async function getMyCustomerUnreadNotificationsCount(customerId: string): Promise<number> {
  const q = query(collection(db, "users", customerId, "notifications"), where("read", "==", false));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count;
}

export function subscribeMyCustomerUnreadNotificationsCount(
  customerId: string,
  onData: (count: number) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(collection(db, "users", customerId, "notifications"), where("read", "==", false));
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

export async function markCustomerNotificationRead(customerId: string, notificationId: string): Promise<void> {
  await updateDoc(doc(db, "users", customerId, "notifications", notificationId), {
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

export async function markAllCustomerNotificationsRead(customerId: string): Promise<void> {
  const q = query(
    collection(db, "users", customerId, "notifications"),
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
