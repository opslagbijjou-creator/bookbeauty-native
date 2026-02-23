const { admin, getFirestore } = require("./_firebaseAdmin");

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BOOKING_SOUND_CHANNEL_ID = "booking-alerts";
const SILENT_CHANNEL_ID = "silent-updates";

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

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
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
    const pushSnap = await db.collection("push_subscriptions").doc(targetUid).get();
    if (!pushSnap.exists) {
      return response(200, {
        ok: true,
        sent: 0,
        reason: "no_subscription",
        uid: targetUid,
      });
    }

    const tokens = normalizeTokens(pushSnap.data()?.tokens);
    if (!tokens.length) {
      return response(200, {
        ok: true,
        sent: 0,
        reason: "no_expo_tokens",
        uid: targetUid,
      });
    }

    const result = await sendExpoPush(tokens, {
      title,
      body: messageBody,
      data,
      playSound,
    });

    return response(200, {
      ok: true,
      uid: targetUid,
      actorUid,
      sent: result.sent,
      chunks: result.chunks,
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
