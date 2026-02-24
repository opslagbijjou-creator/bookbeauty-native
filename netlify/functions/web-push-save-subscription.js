const { admin, getFirestore } = require("./_firebaseAdmin");

const PRIMARY_ADMIN_UID = "mR3MZu9ankZbckM4HZ4ZLFhP8UV2";
const PRIMARY_ADMIN_EMAIL = "hamza@bookbeauty.nl";
const MAX_WEB_SUBSCRIPTIONS_PER_USER = 15;

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

function normalizePermission(value) {
  const permission = String(value || "").trim().toLowerCase();
  if (permission === "granted" || permission === "denied") return permission;
  return "default";
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
    keys: {
      p256dh,
      auth,
    },
  };
}

function normalizeSubscriptionList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  value.forEach((entry) => {
    const normalized = normalizeSubscription(entry);
    if (!normalized) return;
    if (seen.has(normalized.endpoint)) return;
    seen.add(normalized.endpoint);
    output.push(normalized);
  });
  return output;
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

  const body = parseBody(event);
  const requestedUid = String(body.uid || "").trim();
  const targetUid = requestedUid || actor.uid;
  if (!targetUid) {
    return response(400, { ok: false, error: "uid is verplicht." });
  }

  const db = getFirestore();
  const actorIsAdmin = await isAdminUser(db, actor.uid, actor.decoded).catch(() => false);
  if (targetUid !== actor.uid && !actorIsAdmin) {
    return response(403, { ok: false, error: "Geen toegang voor dit uid." });
  }

  const subscription = normalizeSubscription(body.subscription);
  if (!subscription) {
    return response(400, {
      ok: false,
      error: "subscription is ongeldig. Verwacht endpoint + keys.p256dh + keys.auth.",
    });
  }

  const permission = normalizePermission(body.permission);
  const source = String(body.source || "pwa").trim().slice(0, 40) || "pwa";
  const userAgent = String(body.userAgent || "").trim().slice(0, 500);

  const ref = db.collection("push_subscriptions").doc(targetUid);
  let merged = [];

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? normalizeSubscriptionList(snap.data()?.webSubscriptions) : [];
    merged = [subscription, ...current.filter((item) => item.endpoint !== subscription.endpoint)].slice(
      0,
      MAX_WEB_SUBSCRIPTIONS_PER_USER
    );

    const patch = {
      uid: targetUid,
      platform: "web",
      webSubscriptions: merged,
      webPushPermission: permission,
      webPushUpdatedAtMs: Date.now(),
      lastSource: source,
      lastUserAgent: userAgent,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!snap.exists) {
      patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    tx.set(ref, patch, { merge: true });
  });

  return response(200, {
    ok: true,
    uid: targetUid,
    webSubscriptionsCount: merged.length,
  });
};
