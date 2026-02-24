import React, { useCallback, useEffect, useRef } from "react";
import { Alert, AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
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
import { configurePushNotifications, registerPushTokenForUser } from "../lib/pushRepo";
import type { AppRole } from "../lib/roles";

const PRESENCE_TOUCH_INTERVAL_MS = 15_000;

function normalizeRole(role: AppRole | null): AppRole {
  if (role === "company" || role === "employee" || role === "influencer" || role === "admin") return role;
  return "customer";
}

function AppBootstrapEffects() {
  const router = useRouter();
  const activeUidRef = useRef("");
  const activeRoleRef = useRef<AppRole>("customer");
  const lastTouchRef = useRef(0);
  const lastTouchUidRef = useRef("");

  const openRouteFromPushData = useCallback((data: Record<string, unknown>) => {
    const role = String(data.role ?? "").trim();
    const bookingId = String(data.bookingId ?? "").trim();
    const encodedBookingId = bookingId ? encodeURIComponent(bookingId) : "";

    if (role === "company") {
      router.push(
        (encodedBookingId
          ? `/(company)/(tabs)/bookings?bookingId=${encodedBookingId}`
          : "/(company)/notifications") as never
      );
      return;
    }
    if (role === "customer") {
      router.push(
        (encodedBookingId
          ? `/(customer)/(tabs)/bookings?bookingId=${encodedBookingId}`
          : "/(customer)/notifications") as never
      );
      return;
    }
  }, [router]);

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
    configurePushNotifications();

    const unsubAuth = subscribeAuth(async (user) => {
      if (!user?.uid) {
        activeUidRef.current = "";
        activeRoleRef.current = "customer";
        lastTouchUidRef.current = "";
        return;
      }
      await syncUserSession(user.uid).catch(() => null);
      registerPushTokenForUser(user.uid, { requestPermission: false })
        .then((result) => {
          if (result.ok !== true) {
            console.warn("[push] auto register failed", { reason: result.reason, platform: result.platform });
          } else {
            console.log("[push] auto register success", { channel: result.channel, platform: result.platform });
          }
        })
        .catch((error) => {
          console.warn("[push] auto register error", {
            message: error instanceof Error ? error.message : "unknown_error",
          });
        });
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

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      openRouteFromPushData(data);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        openRouteFromPushData(data);
      })
      .catch(() => null);

    return () => sub.remove();
  }, [openRouteFromPushData]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const nav = (globalThis as { navigator?: any }).navigator;
    const worker = nav?.serviceWorker;
    if (!worker?.addEventListener) return;

    const onWorkerMessage = (event: any) => {
      const payload = (event?.data ?? {}) as Record<string, unknown>;
      if (String(payload.type ?? "") !== "bookbeauty-notification-click") return;
      const data = (payload.data ?? {}) as Record<string, unknown>;
      openRouteFromPushData(data);
    };

    worker.addEventListener("message", onWorkerMessage);
    return () => {
      worker.removeEventListener("message", onWorkerMessage);
    };
  }, [openRouteFromPushData]);

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
        <Stack.Screen name="pay/return" />
        <Stack.Screen name="payments" />
        <Stack.Screen name="payment-result" />
      </Stack>
    </>
  );
}
