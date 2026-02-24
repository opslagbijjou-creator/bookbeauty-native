const webPush = require("web-push");
const { admin, getFirestore } = require("./_firebaseAdmin");

const PRIMARY_ADMIN_UID = "mR3MZu9ankZbckM4HZ4ZLFhP8UV2";
const PRIMARY_ADMIN_EMAIL = "hamza@bookbeauty.nl";
const DEFAULT_ICON = "/icon-192.png";
const DEFAULT_BADGE = "/icon-192.png";
const DEFAULT_SUBJECT = "mailto:support@bookbeauty.nl";

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function parseBody(event) {
  try {
    const raw = typeof event.body === "string" ? event.body : "{}";
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseBearerToken(event) {
  const header =
    String(event.headers?.authorization || "").trim() ||
    String(event.headers?.Authorization || "").trim();
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

async function verifyActor(event) {
  const idToken = parseBearerToken(event);
  if (!idToken) throw new Error("UNAUTHORIZED");
  const decoded = await admin.auth().verifyIdToken(idToken);
  const uid = String(decoded?.uid || "").trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return { uid, decoded };
}

async function isAdminUser(db, uid, decoded) {
  const email = String(decoded?.email || "").trim().toLowerCase();
  if (uid === PRIMARY_ADMIN_UID && email === PRIMARY_ADMIN_EMAIL) return true;
  if (String(decoded?.role || "").trim().toLowerCase() === "admin") return true;

  const userSnap = await db.collection("users").doc(uid).get().catch(() => null);
  if (!userSnap?.exists) return false;
  return String(userSnap.data()?.role || "").trim().toLowerCase() === "admin";
}

function normalizeSubscription(raw) {
  const node = raw && typeof raw === "object" ? raw : {};
  const endpoint = String(node.endpoint || "").trim();
  const keys = node.keys && typeof node.keys === "object" ? node.keys : {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();
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

function normalizeSubscriptionList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  value.forEach((item) => {
    const normalized = normalizeSubscription(item);
    if (!normalized) return;
    if (seen.has(normalized.endpoint)) return;
    seen.add(normalized.endpoint);
    output.push(normalized);
  });
  return output;
}

function buildPayload(body) {
  const title = String(body.title || "BookBeauty").trim() || "BookBeauty";
  const notificationBody = String(body.body || "Nieuwe update").trim() || "Nieuwe update";
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
  const url = String(body.url || data.url || "/").trim() || "/";

  return JSON.stringify({
    title,
    body: notificationBody,
    icon: String(body.icon || DEFAULT_ICON).trim() || DEFAULT_ICON,
    badge: String(body.badge || DEFAULT_BADGE).trim() || DEFAULT_BADGE,
    data: {
      ...data,
      url,
    },
  });
}

function configureWebPush() {
  const publicKey = String(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || ""
  ).trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  if (!publicKey || !privateKey) {
    return { ok: false, publicKeyConfigured: Boolean(publicKey), privateKeyConfigured: Boolean(privateKey) };
  }

  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || DEFAULT_SUBJECT).trim() || DEFAULT_SUBJECT;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return { ok: true, publicKeyConfigured: true, privateKeyConfigured: true };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  let actor = null;
  try {
    actor = await verifyActor(event);
  } catch {
    return response(401, { ok: false, error: "Unauthorized" });
  }

  const db = getFirestore();
  const actorIsAdmin = await isAdminUser(db, actor.uid, actor.decoded).catch(() => false);
  if (!actorIsAdmin) {
    return response(403, { ok: false, error: "Admin rechten vereist." });
  }

  const webPushSetup = configureWebPush();
  if (!webPushSetup.ok) {
    return response(500, {
      ok: false,
      error: "WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY ontbreken.",
      publicKeyConfigured: webPushSetup.publicKeyConfigured,
      privateKeyConfigured: webPushSetup.privateKeyConfigured,
    });
  }

  const body = parseBody(event);
  const payload = buildPayload(body);

  const subsSnap = await db.collection("push_subscriptions").get();
  if (subsSnap.empty) {
    return response(200, {
      ok: true,
      sent: 0,
      attempted: 0,
      users: 0,
      staleRemoved: 0,
    });
  }

  let attempted = 0;
  let sent = 0;
  const staleByUid = new Map();

  for (const docSnap of subsSnap.docs) {
    const uid = docSnap.id;
    const subscriptions = normalizeSubscriptionList(docSnap.data()?.webSubscriptions);
    if (!subscriptions.length) continue;

    for (const subscription of subscriptions) {
      attempted += 1;
      try {
        await webPush.sendNotification(subscription, payload, {
          TTL: 60,
          urgency: "high",
        });
        sent += 1;
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          if (!staleByUid.has(uid)) staleByUid.set(uid, new Set());
          staleByUid.get(uid).add(subscription.endpoint);
        }
      }
    }
  }

  let staleRemoved = 0;
  const cleanupTasks = [];
  for (const [uid, endpoints] of staleByUid.entries()) {
    const ref = db.collection("push_subscriptions").doc(uid);
    const snap = subsSnap.docs.find((row) => row.id === uid);
    if (!snap) continue;
    const current = normalizeSubscriptionList(snap.data()?.webSubscriptions);
    const filtered = current.filter((row) => !endpoints.has(row.endpoint));
    staleRemoved += current.length - filtered.length;
    cleanupTasks.push(
      ref.set(
        {
          webSubscriptions: filtered,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          webPushUpdatedAtMs: Date.now(),
        },
        { merge: true }
      )
    );
  }
  await Promise.all(cleanupTasks);

  return response(200, {
    ok: true,
    sent,
    attempted,
    users: subsSnap.size,
    staleRemoved,
  });
};
