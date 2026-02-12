


// FILE: lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ✅ Vul jouw Firebase config in:
const firebaseConfig = {
  apiKey: "AIzaSyC1FvA5_5xz5hE3GJ2lJokVxXILJLS3Vjw",
  authDomain: "bookbeauty-c18a4.firebaseapp.com",
  projectId: "bookbeauty-c18a4",
  storageBucket: "bookbeauty-c18a4.firebasestorage.app",
  messagingSenderId: "349109856237",
  appId: "1:349109856237:web:2787869afb914e9137a9e4"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);