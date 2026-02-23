import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppRole } from "./roles";

export const ONLINE_WINDOW_MINUTES = 5;

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

function buildOnlineThreshold(windowMinutes: number): Date {
  const safeWindow = Math.max(1, Math.floor(windowMinutes));
  return new Date(Date.now() - safeWindow * 60_000);
}

export async function touchPresence(uid: string, role: AppRole | null | undefined): Promise<void> {
  const cleanUid = uid.trim();
  if (!cleanUid) return;

  await setDoc(
    doc(db, "presence", cleanUid),
    {
      uid: cleanUid,
      role: normalizeRole(role),
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchOnlineUsersCount(windowMinutes = ONLINE_WINDOW_MINUTES): Promise<number> {
  const q = query(collection(db, "presence"), where("lastActiveAt", ">=", buildOnlineThreshold(windowMinutes)));
  const countSnap = await getCountFromServer(q);
  return countSnap.data().count;
}

export function subscribeOnlineUsersCount(
  onData: (count: number) => void,
  onError?: (error: unknown) => void,
  windowMinutes = ONLINE_WINDOW_MINUTES
): Unsubscribe {
  const q = query(collection(db, "presence"), where("lastActiveAt", ">=", buildOnlineThreshold(windowMinutes)));
  return onSnapshot(
    q,
    (snap) => onData(snap.size),
    (error) => onError?.(error)
  );
}
