import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export type UserRole = "customer" | "company" | "admin";

export async function getUserRole(uid: string): Promise<UserRole> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return "customer"; // default veilig

  const data = snap.data() as any;
  const role = data?.role;

  if (role === "company" || role === "admin" || role === "customer") return role;
  return "customer";
}

export async function createUserProfile(input: {
  uid: string;
  email: string;
  role: "customer" | "company";
  firstName: string;
  lastName: string;
  companyName?: string;
  kvk?: string;
}) {
  const ref = doc(db, "users", input.uid);

  await setDoc(
    ref,
    {
      uid: input.uid,
      email: input.email,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
      companyName: input.companyName ?? null,
      kvk: input.kvk ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}