import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, initializeAuth as initializeAuthBase } from "firebase/auth";
import { getStorage } from "firebase/storage";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const firebaseConfig = {
  apiKey: "AIzaSyC1FvA5_5xz5hE3GJ2lJokVxXILJLS3Vjw",
  authDomain: "bookbeauty-c18a4.firebaseapp.com",
  projectId: "bookbeauty-c18a4",
  storageBucket: extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "bookbeauty-c18a4.firebasestorage.app",
  messagingSenderId: "349109856237",
  appId: "1:349109856237:web:2787869afb914e9137a9e4",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const rnAuth = require("@firebase/auth/dist/rn/index.js") as {
  initializeAuth: typeof initializeAuthBase;
  getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
};

export const auth = (() => {
  try {
    return rnAuth.initializeAuth(app, {
      persistence: rnAuth.getReactNativePersistence(AsyncStorage) as any,
    });
  } catch {
    return getAuth(app);
  }
})();

export const db = getFirestore(app);
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
export { app };
