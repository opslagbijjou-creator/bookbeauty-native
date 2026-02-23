import {
  addDoc,
  collection,
  doc,
  DocumentData,
  getCountFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppRole } from "./roles";

export type SupportThreadStatus = "open" | "closed";

export type SupportThread = {
  id: string;
  createdById: string;
  createdByRole: AppRole;
  createdByName?: string;
  createdByEmail?: string;
  subject: string;
  status: SupportThreadStatus;
  lastMessagePreview: string;
  messageCount: number;
  unreadByAdminCount: number;
  unreadByCreatorCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  lastMessageAtMs: number;
};

export type SupportMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: AppRole;
  senderName?: string;
  text: string;
  createdAtMs: number;
  updatedAtMs: number;
};

function toMillis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
}

function normalizeRole(role: unknown): AppRole {
  const value = String(role ?? "customer");
  return value === "company" ||
    value === "employee" ||
    value === "influencer" ||
    value === "admin"
    ? value
    : "customer";
}

function normalizeStatus(status: unknown): SupportThreadStatus {
  return status === "closed" ? "closed" : "open";
}

function toSupportThread(id: string, data: Record<string, unknown>): SupportThread {
  return {
    id,
    createdById: String(data.createdById ?? ""),
    createdByRole: normalizeRole(data.createdByRole),
    createdByName: typeof data.createdByName === "string" ? data.createdByName : undefined,
    createdByEmail: typeof data.createdByEmail === "string" ? data.createdByEmail : undefined,
    subject: String(data.subject ?? "Vraag"),
    status: normalizeStatus(data.status),
    lastMessagePreview: String(data.lastMessagePreview ?? ""),
    messageCount: Math.max(0, Math.floor(Number(data.messageCount ?? 0) || 0)),
    unreadByAdminCount: Math.max(0, Math.floor(Number(data.unreadByAdminCount ?? 0) || 0)),
    unreadByCreatorCount: Math.max(0, Math.floor(Number(data.unreadByCreatorCount ?? 0) || 0)),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
    lastMessageAtMs: toMillis(data.lastMessageAt),
  };
}

function toSupportMessage(id: string, data: Record<string, unknown>): SupportMessage {
  return {
    id,
    threadId: String(data.threadId ?? ""),
    senderId: String(data.senderId ?? ""),
    senderRole: normalizeRole(data.senderRole),
    senderName: typeof data.senderName === "string" ? data.senderName : undefined,
    text: String(data.text ?? ""),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

function sortThreads(rows: SupportThread[]): SupportThread[] {
  return [...rows].sort((a, b) => {
    const left = b.lastMessageAtMs || b.updatedAtMs || b.createdAtMs;
    const right = a.lastMessageAtMs || a.updatedAtMs || a.createdAtMs;
    return left - right;
  });
}

export async function createSupportThread(input: {
  createdById: string;
  createdByRole: AppRole;
  createdByName?: string;
  createdByEmail?: string;
  subject: string;
  message: string;
}): Promise<string> {
  const createdById = input.createdById.trim();
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (!createdById) throw new Error("Geen gebruiker gevonden.");
  if (!subject) throw new Error("Vul een onderwerp in.");
  if (!message) throw new Error("Typ eerst je vraag.");

  const now = serverTimestamp();
  const threadRef = await addDoc(collection(db, "support_threads"), {
    createdById,
    createdByRole: input.createdByRole,
    createdByName: input.createdByName?.trim() ?? "",
    createdByEmail: input.createdByEmail?.trim() ?? "",
    subject,
    status: "open",
    lastMessagePreview: message.slice(0, 180),
    messageCount: 1,
    unreadByAdminCount: 1,
    unreadByCreatorCount: 0,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  });

  await addDoc(collection(db, "support_threads", threadRef.id, "messages"), {
    threadId: threadRef.id,
    senderId: createdById,
    senderRole: input.createdByRole,
    senderName: input.createdByName?.trim() ?? "",
    text: message,
    createdAt: now,
    updatedAt: now,
  });

  return threadRef.id;
}

export async function sendSupportMessage(input: {
  threadId: string;
  senderId: string;
  senderRole: AppRole;
  senderName?: string;
  text: string;
}): Promise<void> {
  const threadId = input.threadId.trim();
  const senderId = input.senderId.trim();
  const text = input.text.trim();
  if (!threadId) throw new Error("Geen ticket geselecteerd.");
  if (!senderId) throw new Error("Geen gebruiker gevonden.");
  if (!text) throw new Error("Typ eerst een bericht.");

  const now = serverTimestamp();

  await addDoc(collection(db, "support_threads", threadId, "messages"), {
    threadId,
    senderId,
    senderRole: input.senderRole,
    senderName: input.senderName?.trim() ?? "",
    text,
    createdAt: now,
    updatedAt: now,
  });

  const patch: Record<string, unknown> = {
    lastMessagePreview: text.slice(0, 180),
    lastMessageAt: now,
    updatedAt: now,
    messageCount: increment(1),
  };

  if (input.senderRole === "admin") {
    patch.unreadByAdminCount = 0;
    patch.unreadByCreatorCount = increment(1);
  } else {
    patch.status = "open";
    patch.unreadByAdminCount = increment(1);
    patch.unreadByCreatorCount = 0;
  }

  await updateDoc(doc(db, "support_threads", threadId), patch);
}

export function subscribeMySupportThreads(
  params: { uid: string; role: AppRole },
  onData: (rows: SupportThread[]) => void,
  onError?: (error: unknown) => void,
  take = 50
): Unsubscribe {
  const cleanUid = params.uid.trim();
  if (!cleanUid) {
    onData([]);
    return () => undefined;
  }

  const q =
    params.role === "admin"
      ? query(collection(db, "support_threads"), orderBy("updatedAt", "desc"), limit(take))
      : query(collection(db, "support_threads"), where("createdById", "==", cleanUid), limit(take));

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row: QueryDocumentSnapshot<DocumentData>) => toSupportThread(row.id, row.data()));
      onData(sortThreads(rows));
    },
    (error) => onError?.(error)
  );
}

export function subscribeSupportMessages(
  threadId: string,
  onData: (rows: SupportMessage[]) => void,
  onError?: (error: unknown) => void,
  take = 300
): Unsubscribe {
  const cleanThreadId = threadId.trim();
  if (!cleanThreadId) {
    onData([]);
    return () => undefined;
  }

  const q = query(
    collection(db, "support_threads", cleanThreadId, "messages"),
    orderBy("createdAt", "asc"),
    limit(take)
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row: QueryDocumentSnapshot<DocumentData>) => toSupportMessage(row.id, row.data()));
      onData(rows);
    },
    (error) => onError?.(error)
  );
}

export async function markSupportThreadReadByAdmin(threadId: string): Promise<void> {
  const cleanThreadId = threadId.trim();
  if (!cleanThreadId) return;
  await updateDoc(doc(db, "support_threads", cleanThreadId), {
    unreadByAdminCount: 0,
    updatedAt: serverTimestamp(),
  });
}

export async function markSupportThreadReadByCreator(threadId: string): Promise<void> {
  const cleanThreadId = threadId.trim();
  if (!cleanThreadId) return;
  await updateDoc(doc(db, "support_threads", cleanThreadId), {
    unreadByCreatorCount: 0,
    updatedAt: serverTimestamp(),
  });
}

export async function setSupportThreadStatus(threadId: string, status: SupportThreadStatus): Promise<void> {
  const cleanThreadId = threadId.trim();
  if (!cleanThreadId) return;
  await updateDoc(doc(db, "support_threads", cleanThreadId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export type SupportSummary = {
  totalThreads: number;
  openThreads: number;
  unreadForAdmin: number;
};

export async function fetchSupportSummary(): Promise<SupportSummary> {
  const [totalSnap, openSnap, unreadForAdminSnap] = await Promise.all([
    getCountFromServer(collection(db, "support_threads")),
    getCountFromServer(query(collection(db, "support_threads"), where("status", "==", "open"))),
    getCountFromServer(query(collection(db, "support_threads"), where("unreadByAdminCount", ">", 0))),
  ]);

  return {
    totalThreads: totalSnap.data().count,
    openThreads: openSnap.data().count,
    unreadForAdmin: unreadForAdminSnap.data().count,
  };
}

export async function fetchSupportMessagesCount(threadId: string): Promise<number> {
  const cleanThreadId = threadId.trim();
  if (!cleanThreadId) return 0;
  const snap = await getDocs(collection(db, "support_threads", cleanThreadId, "messages"));
  return snap.size;
}
