import React, { useEffect, useRef } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";
import { Stack } from "expo-router";
import { getUserRole, subscribeAuth } from "../lib/authRepo";
import { ensureBookBeautyAutoFollow } from "../lib/platformRepo";
import { touchPresence } from "../lib/presenceRepo";
import {
  getCameraPermissionState,
  getMediaLibraryPermissionState,
  getMicrophonePermissionState,
  requestCameraPermission,
  requestMediaLibraryPermission,
  requestMicrophonePermission,
} from "../lib/mediaRepo";
import type { AppRole } from "../lib/roles";

const PRESENCE_TOUCH_INTERVAL_MS = 15_000;

function normalizeRole(role: AppRole | null): AppRole {
  if (role === "company" || role === "employee" || role === "influencer" || role === "admin") return role;
  return "customer";
}

function AppBootstrapEffects() {
  const activeUidRef = useRef("");
  const activeRoleRef = useRef<AppRole>("customer");
  const lastTouchRef = useRef(0);
  const lastTouchUidRef = useRef("");

  async function syncUserSession(uid: string, roleHint?: AppRole | null): Promise<void> {
    const cleanUid = uid.trim();
    if (!cleanUid) return;

    const now = Date.now();
    if (lastTouchUidRef.current === cleanUid && now - lastTouchRef.current < PRESENCE_TOUCH_INTERVAL_MS) return;
    lastTouchRef.current = now;
    lastTouchUidRef.current = cleanUid;

    const role = normalizeRole(roleHint ?? (await getUserRole(cleanUid).catch(() => "customer")));
    activeUidRef.current = cleanUid;
    activeRoleRef.current = role;

    await Promise.allSettled([touchPresence(cleanUid, role), ensureBookBeautyAutoFollow(cleanUid, role)]);
  }

  useEffect(() => {
    const unsubAuth = subscribeAuth(async (user) => {
      if (!user?.uid) {
        activeUidRef.current = "";
        activeRoleRef.current = "customer";
        lastTouchUidRef.current = "";
        return;
      }
      await syncUserSession(user.uid).catch(() => null);
    });

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const uid = activeUidRef.current;
      if (!uid) return;
      syncUserSession(uid, activeRoleRef.current).catch(() => null);
    });

    const heartbeat = setInterval(() => {
      const uid = activeUidRef.current;
      if (!uid) return;
      syncUserSession(uid, activeRoleRef.current).catch(() => null);
    }, 60_000);

    return () => {
      unsubAuth();
      appStateSub.remove();
      clearInterval(heartbeat);
    };
  }, []);

  return null;
}

type PermissionState = "granted" | "denied" | "undetermined";

async function ensurePermission(
  readState: () => Promise<PermissionState>,
  request: () => Promise<boolean>
): Promise<boolean> {
  const state = await readState().catch(() => "undetermined" as PermissionState);
  if (state === "granted") return true;
  return request().catch(() => false);
}

function AppStartupPermissionBootstrap() {
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    if (Platform.OS === "web") return;

    const timer = setTimeout(() => {
      Promise.resolve()
        .then(async () => {
          const libraryGranted = await ensurePermission(
            getMediaLibraryPermissionState,
            requestMediaLibraryPermission
          );
          const cameraGranted = await ensurePermission(
            getCameraPermissionState,
            requestCameraPermission
          );
          const microphoneGranted = await ensurePermission(
            getMicrophonePermissionState,
            requestMicrophonePermission
          );

          if (libraryGranted && cameraGranted && microphoneGranted) return;

          Alert.alert(
            "Toestemming nodig",
            "Geef toegang tot galerij, camera en microfoon. Zonder deze rechten werken upload en opnemen niet goed.",
            [
              { text: "Nu niet", style: "cancel" },
              {
                text: "Open instellingen",
                onPress: () => {
                  Linking.openSettings().catch(() => null);
                },
              },
            ]
          );
        })
        .catch(() => null);
    }, 350);

    return () => clearTimeout(timer);
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <>
      <AppBootstrapEffects />
      <AppStartupPermissionBootstrap />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(company)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </>
  );
}
