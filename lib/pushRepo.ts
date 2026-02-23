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
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const PUSH_PROXY_ENDPOINT = "/.netlify/functions/send-expo-push";
const BOOKING_SOUND_CHANNEL_ID = "booking-alerts";
const SILENT_CHANNEL_ID = "silent-updates";
const SOUND_NOTIFICATION_TYPES = new Set(["booking_request", "booking_created", "booking_confirmed"]);
let pushConfigured = false;

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

export async function registerPushTokenForUser(uid: string): Promise<void> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) return;

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
