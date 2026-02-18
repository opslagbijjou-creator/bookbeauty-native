import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { createCompany } from "./companyActions";
import { AppRole, isValidRole } from "./roles";

export type RegisterCompanyInput = {
  email: string;
  password: string;
  name: string;
  city: string;
  categories: string[];
  bio?: string;
  kvk?: string;
  phone?: string;
};

function toEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

async function upsertUserLookup(payload: {
  uid: string;
  email: string;
  role: AppRole;
  companyId?: string;
  name?: string;
}): Promise<void> {
  const key = toEmailKey(payload.email);
  if (!key) return;

  await setDoc(
    doc(db, "user_lookup", key),
    {
      uid: payload.uid,
      email: key,
      role: payload.role,
      companyId: payload.companyId ?? "",
      name: payload.name?.trim() ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureUserDocForLogin(user: User): Promise<void> {
  const uid = user.uid;
  const email = (user.email ?? "").trim();
  if (!uid || !email) return;

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) return;

  const key = toEmailKey(email);
  let lookupData: Record<string, unknown> | null = null;
  try {
    const lookupSnap = await getDoc(doc(db, "user_lookup", key));
    lookupData = lookupSnap.exists() ? (lookupSnap.data() as Record<string, unknown>) : null;
  } catch (error) {
    // Sommige projecten blokkeren read op ontbrekende lookup docs.
    // Login moet dan niet falen; we vallen terug op customer/company inferentie.
    console.warn("[authRepo/ensureUserDocForLogin] lookup read failed, fallback", error);
  }

  let role: AppRole = "customer";
  let companyId = "";

  const lookupUid = String(lookupData?.uid ?? "").trim();
  const lookupRoleRaw = lookupData?.role;
  const lookupCompanyId = String(lookupData?.companyId ?? "").trim();

  if (lookupUid === uid && isValidRole(lookupRoleRaw)) {
    role = lookupRoleRaw;
    companyId = lookupCompanyId;
  } else {
    const companyPublicSnap = await getDoc(doc(db, "companies_public", uid));
    if (companyPublicSnap.exists()) {
      role = "company";
      companyId = uid;
    }
  }

  await setDoc(
    userRef,
    {
      role,
      email,
      ...(companyId ? { companyId } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function login(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureUserDocForLogin(cred.user);
  syncUserLookup(cred.user.uid).catch(() => null);
  return cred.user;
}

export async function registerCustomer(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanEmail = cred.user.email ?? email.trim();
  const fallbackName = cleanEmail.split("@")[0] ?? "Klant";

  await setDoc(doc(db, "users", cred.user.uid), {
    role: "customer",
    email: cleanEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await upsertUserLookup({
    uid: cred.user.uid,
    email: cleanEmail,
    role: "customer",
    name: fallbackName,
  });

  return cred.user;
}

export async function registerCompany(input: RegisterCompanyInput): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  const cleanEmail = cred.user.email ?? input.email.trim();

  await setDoc(doc(db, "users", cred.user.uid), {
    role: "company",
    email: cleanEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await upsertUserLookup({
    uid: cred.user.uid,
    email: cleanEmail,
    role: "company",
    companyId: cred.user.uid,
    name: input.name,
  });

  await createCompany(cred.user.uid, {
    name: input.name,
    city: input.city,
    categories: input.categories,
    bio: input.bio,
    kvk: input.kvk,
    phone: input.phone,
    email: input.email,
  });

  return cred.user;
}

export async function syncUserLookup(uid: string): Promise<void> {
  if (!uid) return;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const role = isValidRole(data.role) ? data.role : "customer";
  const email = String(data.email ?? auth.currentUser?.email ?? "").trim();
  if (!email) return;
  await upsertUserLookup({
    uid,
    email,
    role,
    companyId: typeof data.companyId === "string" ? data.companyId : undefined,
    name: email.split("@")[0],
  });
}

export async function getUserRole(uid: string): Promise<AppRole | null> {
  if (!uid) return null;

  try {
    if (auth.currentUser?.uid === uid) {
      await auth.currentUser.getIdToken();
    }
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;

    const role = snap.data().role;
    return isValidRole(role) ? role : null;
  } catch (error) {
    console.warn("[authRepo/getUserRole] role read failed", error);
    return null;
  }
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
