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

export async function login(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function registerCustomer(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

  await setDoc(doc(db, "users", cred.user.uid), {
    role: "customer",
    email: cred.user.email ?? email.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return cred.user;
}

export async function registerCompany(input: RegisterCompanyInput): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);

  await setDoc(doc(db, "users", cred.user.uid), {
    role: "company",
    email: cred.user.email ?? input.email.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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

export async function getUserRole(uid: string): Promise<AppRole | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;

  const role = snap.data().role;
  return isValidRole(role) ? role : null;
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
