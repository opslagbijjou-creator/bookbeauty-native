import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
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

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const PUSH_PROXY_ENDPOINT = "/.netlify/functions/send-expo-push";
const BOOKING_SOUND_CHANNEL_ID = "booking-alerts";
const SILENT_CHANNEL_ID = "silent-updates";
const SOUND_NOTIFICATION_TYPES = new Set(["booking_request", "booking_created", "booking_confirmed"]);
let pushConfigured = false;

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

function normalizeWebPushSubscriptions(value: unknown): WebPushSubscriptionShape[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: WebPushSubscriptionShape[] = [];
  value.forEach((row) => {
    const normalized = normalizeWebPushSubscription(row);
    if (!normalized) return;
    if (seen.has(normalized.endpoint)) return;
    seen.add(normalized.endpoint);
    output.push(normalized);
  });
  return output;
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

function resolveWebPushVapidPublicKey(): string {
  const processNode = (globalThis as { process?: { env?: Record<string, unknown> } }).process;
  const fromProcess = String(processNode?.env?.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  if (fromProcess) return fromProcess;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return String(extra.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
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

async function registerWebPushSubscriptionForUser(uid: string): Promise<void> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid || Platform.OS !== "web") return;

  const vapidPublicKey = resolveWebPushVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn("[pushRepo] Missing EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY; web push subscription skipped.");
    return;
  }

  const nav = (globalThis as { navigator?: any }).navigator;
  const NotificationApi = (globalThis as { Notification?: any }).Notification;
  const PushManagerApi = (globalThis as { PushManager?: any }).PushManager;
  if (!nav?.serviceWorker || !NotificationApi || !PushManagerApi) return;
  if (!(globalThis as { isSecureContext?: boolean }).isSecureContext) return;

  const currentPermission = String(NotificationApi.permission ?? "default");
  const permission =
    currentPermission === "granted"
      ? "granted"
      : await Promise.resolve(NotificationApi.requestPermission?.()).catch(() => "default");
  if (permission !== "granted") return;

  const registration = await nav.serviceWorker.register("/web-push-sw.js").catch(() => null);
  if (!registration) return;
  const readyRegistration = await nav.serviceWorker.ready.catch(() => registration);
  const pushManager = readyRegistration?.pushManager ?? registration.pushManager;
  if (!pushManager) return;

  let subscription = await pushManager.getSubscription().catch(() => null);
  if (!subscription) {
    const applicationServerKey = base64UrlToUint8Array(vapidPublicKey);
    if (!applicationServerKey.length) return;
    subscription = await pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
      .catch(() => null);
  }
  if (!subscription) return;

  const payload = normalizeWebPushSubscription(
    typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription
  );
  if (!payload) return;

  const ref = doc(db, "push_subscriptions", cleanUid);
  const existingSnap = await getDoc(ref).catch(() => null);
  const existing = normalizeWebPushSubscriptions(existingSnap?.data()?.webSubscriptions);
  const merged = [payload, ...existing.filter((row) => row.endpoint !== payload.endpoint)].slice(0, 15);

  await setDoc(
    ref,
    {
      uid: cleanUid,
      webSubscriptions: merged,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
      webPushUpdatedAtMs: Date.now(),
    },
    { merge: true }
  );
}

export async function registerPushTokenForUser(uid: string): Promise<void> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) return;

  if (Platform.OS === "web") {
    await registerWebPushSubscriptionForUser(cleanUid);
    return;
  }

  configurePushNotifications();

  const granted = await requestPushPermission().catch(() => false);
  if (!granted) return;

  const projectId = resolveProjectId();
  const pushToken = await (projectId
    ? Notifications.getExpoPushTokenAsync({ projectId })
    : Notifications.getExpoPushTokenAsync())
    .then((row) => String(row?.data ?? "").trim())
    .catch((error) => {
      console.warn("[pushRepo] getExpoPushTokenAsync failed", error);
      return "";
    });

  if (!pushToken) return;

  await setDoc(
    doc(db, "push_subscriptions", cleanUid),
    {
      uid: cleanUid,
      tokens: arrayUnion(pushToken),
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
  if (Platform.OS !== "web") return false;
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  const idToken = await currentUser.getIdToken().catch(() => "");
  if (!idToken) return false;

  const response = await fetch(PUSH_PROXY_ENDPOINT, {
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

  return Boolean(response?.ok);
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
  if (pushedViaProxy) return;

  const snap = await getDoc(doc(db, "push_subscriptions", cleanUid));
  if (!snap.exists()) return;

  const data = snap.data() as PushSubscriptionDoc;
  const tokens = normalizeTokens(data.tokens);
  if (!tokens.length) return;

  await sendExpoPush(tokens, message);
}
