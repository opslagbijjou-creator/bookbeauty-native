const { admin, getFirestore } = require("./_firebaseAdmin");
let webPushModule = null;
try {
  webPushModule = require("web-push");
} catch {
  webPushModule = null;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BOOKING_SOUND_CHANNEL_ID = "booking-alerts";
const SILENT_CHANNEL_ID = "silent-updates";
const WEB_PUSH_DEFAULT_SUBJECT = "mailto:support@bookbeauty.nl";
let webPushConfigured = false;

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

function parseBody(event) {
  try {
    const raw = typeof event.body === "string" ? event.body : "{}";
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function chunk(items, size) {
  if (!Array.isArray(items) || size <= 0) return [items];
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function normalizeTokens(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => item.startsWith("ExponentPushToken[") && item.endsWith("]"))
    )
  );
}

function normalizeWebSubscriptions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  value.forEach((item) => {
    const node = item && typeof item === "object" ? item : {};
    const endpoint = String(node.endpoint || "").trim();
    const keys = node.keys && typeof node.keys === "object" ? node.keys : {};
    const p256dh = String(keys.p256dh || "").trim();
    const auth = String(keys.auth || "").trim();
    if (!endpoint || !p256dh || !auth) return;
    if (seen.has(endpoint)) return;
    seen.add(endpoint);
    output.push({
      endpoint,
      expirationTime: Number.isFinite(node.expirationTime) ? Number(node.expirationTime) : null,
      keys: {
        p256dh,
        auth,
      },
    });
  });
  return output;
}

function mergeUniqueTokens(...groups) {
  const merged = new Set();
  groups.forEach((list) => {
    normalizeTokens(list).forEach((token) => merged.add(token));
  });
  return Array.from(merged);
}

function mergeUniqueWebSubscriptions(...groups) {
  const seen = new Set();
  const output = [];
  groups.forEach((list) => {
    normalizeWebSubscriptions(list).forEach((sub) => {
      if (seen.has(sub.endpoint)) return;
      seen.add(sub.endpoint);
      output.push(sub);
    });
  });
  return output;
}

async function resolveRecipientUids(db, targetUid) {
  const cleanTargetUid = String(targetUid || "").trim();
  const recipients = new Set([cleanTargetUid]);
  if (!cleanTargetUid) return [];

  const companySnap = await db.collection("companies").doc(cleanTargetUid).get().catch(() => null);
  if (companySnap?.exists) {
    const company = companySnap.data() || {};
    const ownerId = String(company.ownerId || "").trim();
    if (ownerId) recipients.add(ownerId);

    const staffSnap = await db
      .collection("companies")
      .doc(cleanTargetUid)
      .collection("staff")
      .where("isActive", "==", true)
      .get()
      .catch(() => null);

    if (staffSnap && !staffSnap.empty) {
      staffSnap.docs.forEach((staffDoc) => {
        const staffData = staffDoc.data() || {};
        const staffUid = String(staffData.userId || staffDoc.id || "").trim();
        if (staffUid) recipients.add(staffUid);
      });
    }
  }

  return Array.from(recipients).filter(Boolean);
}

async function loadPushTargetsByRecipient(db, recipientUids) {
  const cleanUids = Array.from(new Set((recipientUids || []).map((uid) => String(uid || "").trim()).filter(Boolean)));
  const recipients = [];
  for (const uid of cleanUids) {
    const snap = await db.collection("push_subscriptions").doc(uid).get().catch(() => null);
    if (!snap?.exists) continue;
    const data = snap.data() || {};
    const tokens = normalizeTokens(data.tokens);
    const webSubscriptions = normalizeWebSubscriptions(data.webSubscriptions);
    if (!tokens.length && !webSubscriptions.length) continue;
    recipients.push({
      uid,
      tokens,
      webSubscriptions,
    });
  }
  return recipients;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

function resolveWebPushClient() {
  if (!webPushModule) return null;
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || WEB_PUSH_DEFAULT_SUBJECT).trim() || WEB_PUSH_DEFAULT_SUBJECT;
  if (!publicKey || !privateKey) return null;
  if (!webPushConfigured) {
    webPushModule.setVapidDetails(subject, publicKey, privateKey);
    webPushConfigured = true;
  }
  return webPushModule;
}

function resolveNotificationUrl(data) {
  const role = String(data.role || "").trim();
  const bookingId = String(data.bookingId || "").trim();
  if (role === "company") {
    return bookingId
      ? `/(company)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}`
      : "/(company)/notifications";
  }
  if (role === "customer") {
    return bookingId
      ? `/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}`
      : "/(customer)/notifications";
  }
  return "/";
}

async function verifyUserUid(event) {
  const rawAuth =
    String(event.headers?.authorization || "").trim() ||
    String(event.headers?.Authorization || "").trim();
  if (!rawAuth.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const idToken = rawAuth.slice(7).trim();
  if (!idToken) {
    throw new Error("Missing bearer token");
  }

  const decoded = await admin.auth().verifyIdToken(idToken);
  return String(decoded?.uid || "").trim();
}

async function sendExpoPush(tokens, message) {
  if (!tokens.length) return { sent: 0, chunks: 0 };

  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    sound: message.playSound ? "default" : undefined,
    priority: "high",
    data: {
      ...(message.data || {}),
      playSound: Boolean(message.playSound),
    },
    channelId: message.playSound ? BOOKING_SOUND_CHANNEL_ID : SILENT_CHANNEL_ID,
  }));

  const chunks = chunk(payload, 100);
  let sent = 0;
  for (const part of chunks) {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(part),
    });
    sent += part.length;
  }

  return { sent, chunks: chunks.length };
}

async function sendWebPush(subscriptions, message) {
  if (!subscriptions.length) return { sent: 0, attempted: 0, expiredEndpoints: [], configured: true };
  const webPush = resolveWebPushClient();
  if (!webPush) {
    return { sent: 0, attempted: subscriptions.length, expiredEndpoints: [], configured: false };
  }

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      ...(message.data || {}),
      url: resolveNotificationUrl(message.data || {}),
    },
    playSound: Boolean(message.playSound),
  });

  let sent = 0;
  const expiredEndpoints = [];
  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(subscription, payload, {
        TTL: 60,
        urgency: "high",
      });
      sent += 1;
    } catch (error) {
      const status = Number(error && error.statusCode ? error.statusCode : 0);
      if (status === 404 || status === 410) {
        expiredEndpoints.push(subscription.endpoint);
      }
    }
  }

  return {
    sent,
    attempted: subscriptions.length,
    expiredEndpoints,
    configured: true,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  let actorUid = "";
  try {
    actorUid = await verifyUserUid(event);
  } catch {
    return response(401, { ok: false, error: "Unauthorized" });
  }

  const body = parseBody(event);
  const targetUid = String(body.uid || "").trim();
  const title = String(body.title || "").trim();
  const messageBody = String(body.body || "").trim();
  const playSound = parseBoolean(body.playSound);
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};

  if (!targetUid || !title || !messageBody) {
    return response(400, { ok: false, error: "uid, title en body zijn verplicht." });
  }

  try {
    const db = getFirestore();
    const recipientUids = await resolveRecipientUids(db, targetUid);
    const recipients = await loadPushTargetsByRecipient(db, recipientUids);
    if (!recipients.length) {
      return response(200, {
        ok: true,
        sent: 0,
        reason: "no_push_targets",
        uid: targetUid,
        recipientUids,
      });
    }

    const tokens = mergeUniqueTokens(...recipients.map((row) => row.tokens));
    const webSubscriptions = mergeUniqueWebSubscriptions(...recipients.map((row) => row.webSubscriptions));

    const message = {
      title,
      body: messageBody,
      data,
      playSound,
    };
    const expoResult = await sendExpoPush(tokens, message);
    const webResult = await sendWebPush(webSubscriptions, message);

    if (webResult.expiredEndpoints.length) {
      const stale = new Set(webResult.expiredEndpoints);
      await Promise.all(
        recipients.map(async (recipient) => {
          const filtered = recipient.webSubscriptions.filter((row) => !stale.has(row.endpoint));
          if (filtered.length === recipient.webSubscriptions.length) return;
          await db.collection("push_subscriptions").doc(recipient.uid).set(
            {
              webSubscriptions: filtered,
            },
            { merge: true }
          );
        })
      ).catch(() => null);
    }

    return response(200, {
      ok: true,
      uid: targetUid,
      actorUid,
      sent: expoResult.sent + webResult.sent,
      recipientUids,
      expo: {
        sent: expoResult.sent,
        chunks: expoResult.chunks,
      },
      web: {
        sent: webResult.sent,
        attempted: webResult.attempted,
        configured: webResult.configured,
        expiredRemoved: webResult.expiredEndpoints.length,
      },
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Push versturen mislukt",
      uid: targetUid,
      actorUid,
    });
  }
};
