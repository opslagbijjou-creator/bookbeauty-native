import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type PushSubscriptionDoc = {
  uid?: unknown;
  tokens?: unknown;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
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

export function configurePushNotifications(): void {
  if (pushConfigured) return;
  pushConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "Standaard",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: "#335DFF",
      sound: "default",
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
  if (Platform.OS === "web") return;

  configurePushNotifications();

  const granted = await requestPushPermission().catch(() => false);
  if (!granted) return;

  const projectId = resolveProjectId();
  const pushToken = await (projectId
    ? Notifications.getExpoPushTokenAsync({ projectId })
    : Notifications.getExpoPushTokenAsync())
    .then((row) => String(row?.data ?? "").trim())
    .catch(() => "");

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

  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    sound: "default",
    priority: "high",
    data: message.data ?? {},
    channelId: Platform.OS === "android" ? "default" : undefined,
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

export async function sendPushToUser(
  uid: string,
  message: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  const cleanUid = String(uid ?? "").trim();
  if (!cleanUid) return;

  const snap = await getDoc(doc(db, "push_subscriptions", cleanUid));
  if (!snap.exists()) return;

  const data = snap.data() as PushSubscriptionDoc;
  const tokens = normalizeTokens(data.tokens);
  if (!tokens.length) return;

  await sendExpoPush(tokens, message);
}

