import React, { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { getUserRole, subscribeAuth } from "../lib/authRepo";
import { ensureBookBeautyAutoFollow } from "../lib/platformRepo";
import { touchPresence } from "../lib/presenceRepo";
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

export default function RootLayout() {
  return (
    <>
      <AppBootstrapEffects />
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
