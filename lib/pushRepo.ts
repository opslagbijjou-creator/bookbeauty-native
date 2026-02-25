import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  playSound?: boolean;
};

type PushSubscriptionDoc = {
  uid?: unknown;
  tokens?: unknown;
  webSubscriptions?: unknown;
};

export type PushRegistrationReason =
  | "ok"
  | "missing_uid"
  | "not_web"
  | "insecure_context"
  | "unsupported_browser"
  | "ios_requires_homescreen"
  | "ios_version_unsupported"
  | "permission_not_granted"
  | "permission_denied"
  | "missing_vapid_public_key"
  | "service_worker_failed"
  | "subscription_failed"
  | "backend_save_failed"
  | "token_failed"
  | "unknown_error";

export type PushRegistrationResult = {
  ok: boolean;
  platform: "web" | "native";
  channel?: "web_push" | "expo";
  reason: PushRegistrationReason;
  permission?: string;
};

export type RegisterPushOptions = {
  requestPermission?: boolean;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const PUSH_PROXY_ENDPOINT = "/.netlify/functions/send-expo-push";
const WEB_PUSH_PUBLIC_KEY_ENDPOINT = "/.netlify/functions/web-push-public-key";
const WEB_PUSH_SAVE_ENDPOINT = "/.netlify/functions/web-push-save-subscription";
const BOOKING_SOUND_CHANNEL_ID = "booking-alerts";
const SILENT_CHANNEL_ID = "silent-updates";
const SOUND_NOTIFICATION_TYPES = new Set(["booking_request", "booking_created", "booking_confirmed"]);
let pushConfigured = false;
let cachedVapidPublicKey = "";

function showPushWriteAlert(title: string, message: string, enabled: boolean): void {
  if (!enabled) return;
  try {
    Alert.alert(title, message);
  } catch {
    // Ignore alert failures in non-visual environments.
  }
}

type WebPushSubscriptionShape = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function normalizeTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.startsWith("ExponentPushToken[") && item.endsWith("]"))
    )
  );
}

function normalizeWebPushSubscription(value: unknown): WebPushSubscriptionShape | null {
  const node = (value as Record<string, unknown> | undefined) ?? {};
  const endpoint = String(node.endpoint ?? "").trim();
  const keysNode = (node.keys as Record<string, unknown> | undefined) ?? {};
  const p256dh = String(keysNode.p256dh ?? "").trim();
  const auth = String(keysNode.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) return null;

  const expirationRaw = node.expirationTime;
  const expirationTime =
    typeof expirationRaw === "number" && Number.isFinite(expirationRaw) ? expirationRaw : null;

  return {
    endpoint,
    expirationTime,
    keys: { p256dh, auth },
  };
}

function mergeUniqueWebSubscriptions(
  current: WebPushSubscriptionShape[],
  next: WebPushSubscriptionShape
): WebPushSubscriptionShape[] {
  return [next, ...current.filter((item) => item.endpoint !== next.endpoint)].slice(0, 15);
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const atobFn = (globalThis as { atob?: (raw: string) => string }).atob;
  if (typeof atobFn !== "function") return new Uint8Array();
  const raw = atobFn(padded);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function resolveWebPushVapidPublicKeyFromRuntime(): string {
  const processNode = (globalThis as { process?: { env?: Record<string, unknown> } }).process;
  const fromProcess = String(processNode?.env?.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  if (fromProcess) return fromProcess;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return String(extra.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
}

function resolveAppBaseUrl(): string {
  const processNode = (globalThis as { process?: { env?: Record<string, unknown> } }).process;
  const fromProcess = String(processNode?.env?.EXPO_PUBLIC_APP_BASE_URL ?? "").trim();
  if (fromProcess) return fromProcess.replace(/\/+$/, "");
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = String(extra.EXPO_PUBLIC_APP_BASE_URL ?? "").trim();
  if (fromExtra) return fromExtra.replace(/\/+$/, "");
  return "https://www.bookbeauty.nl";
}

function resolveFunctionUrl(path: string): string {
  if (Platform.OS === "web") return path;
  const base = resolveAppBaseUrl();
  if (!base) return "";
  return `${base}${path}`;
}

async function resolveWebPushVapidPublicKey(): Promise<string> {
  if (cachedVapidPublicKey) return cachedVapidPublicKey;

  const runtimeKey = resolveWebPushVapidPublicKeyFromRuntime();
  if (runtimeKey) {
    cachedVapidPublicKey = runtimeKey;
    return runtimeKey;
  }

  if (Platform.OS !== "web") return "";
  const response = await fetch(WEB_PUSH_PUBLIC_KEY_ENDPOINT, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  }).catch(() => null);
  if (!response?.ok) return "";

  const payload = await response.json().catch(() => null);
  const publicKey = String(
    (payload as Record<string, unknown> | null)?.publicKey ??
      (payload as Record<string, unknown> | null)?.key ??
      ""
  ).trim();
  if (!publicKey) return "";
  cachedVapidPublicKey = publicKey;
  return publicKey;
}

function isIosWebEnvironment(navigatorRef: Navigator): boolean {
  const ua = String(navigatorRef.userAgent ?? "");
  const touchCapableMac = /\bMacintosh\b/i.test(ua) && Number(navigatorRef.maxTouchPoints ?? 0) > 1;
  return /\b(iPad|iPhone|iPod)\b/i.test(ua) || touchCapableMac;
}

function iosMajorMinorVersion(navigatorRef: Navigator): { major: number; minor: number } | null {
  const ua = String(navigatorRef.userAgent ?? "");
  const match = ua.match(/OS (\d+)[._](\d+)/i);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

function isStandaloneDisplayMode(navigatorRef: Navigator): boolean {
  const navStandalone = Boolean((navigatorRef as Navigator & { standalone?: boolean }).standalone);
  const mm = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
  const displayModeStandalone = Boolean(mm?.("(display-mode: standalone)")?.matches);
  return navStandalone || displayModeStandalone;
}

function resolveProjectId(): string | undefined {
  const fromEas = (Constants.easConfig as { projectId?: string } | null)?.projectId;
  if (fromEas?.trim()) return fromEas.trim();

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = String(extra.EXPO_PUBLIC_EAS_PROJECT_ID ?? "").trim();
  if (fromExtra) return fromExtra;

  const fromNestedExtra = String((extra.eas as { projectId?: string } | undefined)?.projectId ?? "").trim();
  return fromNestedExtra || undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function shouldPlaySoundForData(data: Record<string, unknown>): boolean {
  const explicit = parseBoolean(data.playSound);
  if (typeof explicit === "boolean") return explicit;
  const notificationType = String(data.notificationType ?? "").trim();
  return SOUND_NOTIFICATION_TYPES.has(notificationType);
}

export function configurePushNotifications(): void {
  if (pushConfigured) return;
  pushConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
      const shouldPlaySound = shouldPlaySoundForData(data);
      return {
        shouldShowAlert: true,
        shouldPlaySound,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(BOOKING_SOUND_CHANNEL_ID, {
      name: "Boekingen",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: "#335DFF",
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => null);

    Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
      name: "Updates zonder geluid",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0],
      lightColor: "#335DFF",
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => null);
  }
}

async function requestPushPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function registerWebPushSubscriptionForUser(
  uid: string,
  options: RegisterPushOptions = {}
): Promise<PushRegistrationResult> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) {
    return {
      ok: false,
      platform: "web",
      reason: "missing_uid",
    };
  }
  if (Platform.OS !== "web") {
    return {
      ok: false,
      platform: "web",
      reason: "not_web",
    };
  }

  const nav = (globalThis as { navigator?: any }).navigator;
  const NotificationApi = (globalThis as { Notification?: any }).Notification;
  const PushManagerApi = (globalThis as { PushManager?: any }).PushManager;
  if (!nav?.serviceWorker || !NotificationApi || !PushManagerApi) {
    return {
      ok: false,
      platform: "web",
      reason: "unsupported_browser",
    };
  }
  if (!(globalThis as { isSecureContext?: boolean }).isSecureContext) {
    return {
      ok: false,
      platform: "web",
      reason: "insecure_context",
    };
  }

  if (isIosWebEnvironment(nav)) {
    const iosVersion = iosMajorMinorVersion(nav);
    if (iosVersion) {
      if (iosVersion.major < 16 || (iosVersion.major === 16 && iosVersion.minor < 4)) {
        return {
          ok: false,
          platform: "web",
          reason: "ios_version_unsupported",
        };
      }
    }
    if (!isStandaloneDisplayMode(nav)) {
      return {
        ok: false,
        platform: "web",
        reason: "ios_requires_homescreen",
      };
    }
  }

  const currentPermission = String(NotificationApi.permission ?? "default");
  let permission = currentPermission;
  if (permission !== "granted") {
    if (options.requestPermission !== true) {
      return {
        ok: false,
        platform: "web",
        reason: "permission_not_granted",
        permission,
      };
    }
    permission = await Promise.resolve(NotificationApi.requestPermission?.()).catch(() => "default");
  }
  if (permission !== "granted") {
    return {
      ok: false,
      platform: "web",
      reason: "permission_denied",
      permission,
    };
  }

  const vapidPublicKey = await resolveWebPushVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn("[pushRepo] Missing public VAPID key; web push subscription skipped.");
    return {
      ok: false,
      platform: "web",
      reason: "missing_vapid_public_key",
      permission,
    };
  }

  const registration = await nav.serviceWorker.register("/sw.js").catch(() => null);
  if (!registration) {
    return {
      ok: false,
      platform: "web",
      reason: "service_worker_failed",
      permission,
    };
  }
  const readyRegistration = await nav.serviceWorker.ready.catch(() => registration);
  const pushManager = readyRegistration?.pushManager ?? registration.pushManager;
  if (!pushManager) {
    return {
      ok: false,
      platform: "web",
      reason: "subscription_failed",
      permission,
    };
  }

  let subscription = await pushManager.getSubscription().catch(() => null);
  if (!subscription) {
    const applicationServerKey = base64UrlToUint8Array(vapidPublicKey);
    if (!applicationServerKey.length) {
      return {
        ok: false,
        platform: "web",
        reason: "missing_vapid_public_key",
        permission,
      };
    }
    subscription = await pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
      .catch(() => null);
  }
  if (!subscription) {
    return {
      ok: false,
      platform: "web",
      reason: "subscription_failed",
      permission,
    };
  }

  const payload = normalizeWebPushSubscription(
    typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription
  );
  if (!payload) {
    return {
      ok: false,
      platform: "web",
      reason: "subscription_failed",
      permission,
    };
  }

  const savedViaBackend = await saveWebPushSubscriptionViaBackend(cleanUid, payload, permission);
  if (!savedViaBackend) {
    const savedDirect = await saveWebPushSubscriptionDirect(cleanUid, payload, permission).catch(() => false);
    if (!savedDirect) {
      return {
        ok: false,
        platform: "web",
        reason: "backend_save_failed",
        permission,
      };
    }
    console.log("[pushRepo] Web push subscription saved via direct Firestore fallback", {
      uid: cleanUid,
      endpointTail: payload.endpoint.slice(-12),
    });
  }

  return {
    ok: true,
    platform: "web",
    channel: "web_push",
    reason: "ok",
    permission,
  };
}

async function saveWebPushSubscriptionViaBackend(
  uid: string,
  subscription: WebPushSubscriptionShape,
  permission: string
): Promise<boolean> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid || Platform.OS !== "web") return false;

  const currentUser = auth.currentUser;
  if (!currentUser) return false;
  const actorUid = String(currentUser.uid ?? "").trim();
  if (!actorUid || actorUid !== cleanUid) return false;

  const idToken = await currentUser.getIdToken().catch(() => "");
  if (!idToken) return false;

  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const userAgent = String(nav?.userAgent ?? "").trim();

  const response = await fetch(WEB_PUSH_SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      uid: cleanUid,
      permission,
      subscription,
      source: "pwa",
      userAgent,
    }),
  }).catch(() => null);

  if (!response?.ok) return false;

  const payload = await response.json().catch(() => null);
  return Boolean((payload as { ok?: unknown } | null)?.ok === true);
}

async function saveWebPushSubscriptionDirect(
  uid: string,
  subscription: WebPushSubscriptionShape,
  permission: string
): Promise<boolean> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) return false;

  const currentUser = auth.currentUser;
  if (!currentUser) return false;
  const actorUid = String(currentUser.uid ?? "").trim();
  if (!actorUid || actorUid !== cleanUid) return false;

  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const userAgent = String(nav?.userAgent ?? "").trim().slice(0, 500);

  const ref = doc(db, "push_subscriptions", cleanUid);
  const snap = await getDoc(ref).catch(() => null);
  const existingData = (snap?.exists() ? (snap.data() as PushSubscriptionDoc) : {}) ?? {};

  const existingWeb = Array.isArray(existingData.webSubscriptions)
    ? existingData.webSubscriptions
        .map((row) => normalizeWebPushSubscription(row))
        .filter((row): row is WebPushSubscriptionShape => Boolean(row))
    : [];

  const mergedWeb = mergeUniqueWebSubscriptions(existingWeb, subscription);

  await setDoc(
    ref,
    {
      uid: cleanUid,
      platform: "web",
      webSubscriptions: mergedWeb,
      webPushPermission: permission,
      webPushUpdatedAtMs: Date.now(),
      lastSource: "pwa-direct-fallback",
      lastUserAgent: userAgent,
      ...(snap?.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return true;
}

export async function registerPushTokenForUser(
  uid: string,
  options: RegisterPushOptions = {}
): Promise<PushRegistrationResult> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) {
    return {
      ok: false,
      platform: Platform.OS === "web" ? "web" : "native",
      reason: "missing_uid",
    };
  }

  if (Platform.OS === "web") {
    return registerWebPushSubscriptionForUser(cleanUid, options);
  }

  configurePushNotifications();

  const granted = await requestPushPermission().catch(() => false);
  if (!granted) {
    return {
      ok: false,
      platform: "native",
      reason: "permission_denied",
    };
  }

  const projectId = resolveProjectId();
  const pushToken = await (projectId
    ? Notifications.getExpoPushTokenAsync({ projectId })
    : Notifications.getExpoPushTokenAsync())
    .then((row) => String(row?.data ?? "").trim())
    .catch((error) => {
      console.warn("[pushRepo] getExpoPushTokenAsync failed", error);
      return "";
    });

  if (!pushToken) {
    return {
      ok: false,
      platform: "native",
      reason: "token_failed",
    };
  }

  const showDebugAlert = options.requestPermission === true;

  try {
    const pushRef = doc(db, "push_subscriptions", cleanUid);
    const existingSnap = await getDoc(pushRef);
    const existingData = (existingSnap.exists() ? (existingSnap.data() as PushSubscriptionDoc) : {}) ?? {};
    const existingTokens = normalizeTokens(existingData.tokens);
    const mergedTokens = Array.from(new Set([...existingTokens, pushToken]));

    await setDoc(
      pushRef,
      {
        uid: cleanUid,
        tokens: mergedTokens,
        platform: Platform.OS,
        ...(existingSnap.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[pushRepo] push_subscriptions write success", {
      uid: cleanUid,
      tokenCount: mergedTokens.length,
      created: !existingSnap.exists(),
    });
    showPushWriteAlert(
      "Push opgeslagen",
      `push_subscriptions/${cleanUid} opgeslagen met ${mergedTokens.length} token(s).`,
      showDebugAlert
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.warn("[pushRepo] push_subscriptions write failed", {
      uid: cleanUid,
      message,
    });
    showPushWriteAlert(
      "Push opslaan mislukt",
      `Kon push_subscriptions/${cleanUid} niet opslaan: ${message}`,
      true
    );
    return {
      ok: false,
      platform: "native",
      reason: "backend_save_failed",
    };
  }

  return {
    ok: true,
    platform: "native",
    channel: "expo",
    reason: "ok",
  };
}

async function sendExpoPush(tokens: string[], message: PushMessage): Promise<void> {
  if (!tokens.length) return;
  const playSound = message.playSound === true;
  const data = {
    ...(message.data ?? {}),
    playSound,
  };

  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    sound: playSound ? "default" : undefined,
    priority: "high",
    data,
    channelId: playSound ? BOOKING_SOUND_CHANNEL_ID : SILENT_CHANNEL_ID,
  }));

  const chunks = chunk(payload, 100);
  for (const part of chunks) {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(part),
    }).catch(() => null);
  }
}

async function sendPushViaBackendProxy(uid: string, message: PushMessage): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  const idToken = await currentUser.getIdToken().catch(() => "");
  if (!idToken) return false;

  const endpoint = resolveFunctionUrl(PUSH_PROXY_ENDPOINT);
  if (!endpoint) {
    console.warn("[pushRepo] Missing EXPO_PUBLIC_APP_BASE_URL for backend push proxy.");
    return false;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      uid,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      playSound: message.playSound === true,
    }),
  }).catch(() => null);

  if (!response?.ok) {
    const status = Number(response?.status || 0);
    console.warn("[pushRepo] Backend push proxy call failed", { status, endpoint });
    return false;
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return true;

  const sent = Number((payload as { sent?: unknown }).sent ?? 0);
  if (Number.isFinite(sent) && sent > 0) return true;

  const reason = String((payload as { reason?: unknown }).reason ?? "").trim();
  if (reason === "no_subscription" || reason === "no_push_targets") return false;

  const web = (payload as { web?: { configured?: unknown } }).web;
  if (typeof web?.configured === "boolean" && web.configured === false) {
    console.warn("[pushRepo] Web push backend is not configured (missing VAPID keys).");
    return false;
  }

  return true;
}

export async function sendPushToUser(
  uid: string,
  message: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    playSound?: boolean;
  }
): Promise<void> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) return;

  const pushedViaProxy = await sendPushViaBackendProxy(cleanUid, {
    title: message.title,
    body: message.body,
    data: message.data,
    playSound: message.playSound,
  }).catch(() => false);
  if (pushedViaProxy) {
    return;
  }

  const currentUid = String(auth.currentUser?.uid || "").trim();
  if (!currentUid || currentUid !== cleanUid) {
    console.warn("[pushRepo] Push fallback skipped because target uid differs and proxy failed.", {
      targetUid: cleanUid,
      actorUid: currentUid || "none",
    });
    return;
  }

  const snap = await getDoc(doc(db, "push_subscriptions", cleanUid)).catch(() => null);
  if (!snap?.exists()) return;

  const data = snap.data() as PushSubscriptionDoc;
  const tokens = normalizeTokens(data.tokens);
  if (!tokens.length) return;

  await sendExpoPush(tokens, message);
}
