const { createMollieClient } = require("@mollie/api-client");
const { getFirestore, admin } = require("./_firebaseAdmin");
const { isTestMode, requireEnv, response } = require("./_mollieConnect");
let webPushModule = null;
try {
  webPushModule = require("web-push");
} catch {
  webPushModule = null;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const WEB_PUSH_DEFAULT_SUBJECT = "mailto:support@bookbeauty.nl";
let webPushConfigured = false;

function parsePaymentId(event) {
  const query = event.queryStringParameters || {};
  const fromQuery = String(query.paymentId || query.id || "").trim();
  if (fromQuery) return fromQuery;

  const bodyRaw = typeof event.body === "string" ? event.body.trim() : "";
  if (!bodyRaw) return "";

  try {
    const parsed = JSON.parse(bodyRaw || "{}");
    const fromJson = String(parsed?.id || parsed?.paymentId || "").trim();
    if (fromJson) return fromJson;
  } catch {
    // Fall through to x-www-form-urlencoded parsing.
  }

  if (bodyRaw.includes("=")) {
    const form = new URLSearchParams(bodyRaw);
    const fromForm = String(form.get("id") || form.get("paymentId") || "").trim();
    if (fromForm) return fromForm;
  }

  return "";
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
      keys: { p256dh, auth },
    });
  });
  return output;
}

function chunk(items, size) {
  if (!Array.isArray(items) || size <= 0) return [items];
  const output = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function resolveWebPushClient() {
  if (!webPushModule) return null;
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  if (!publicKey || !privateKey) return null;
  if (!webPushConfigured) {
    const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || WEB_PUSH_DEFAULT_SUBJECT).trim() || WEB_PUSH_DEFAULT_SUBJECT;
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

async function sendExpoPush(tokens, message) {
  if (!tokens.length) return;

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
    channelId: message.playSound ? "booking-alerts" : "silent-updates",
  }));

  const parts = chunk(payload, 100);
  for (const part of parts) {
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

async function sendWebPush(subscriptions, message) {
  if (!subscriptions.length) return;
  const webPush = resolveWebPushClient();
  if (!webPush) return;

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

  for (const subscription of subscriptions) {
    await webPush
      .sendNotification(subscription, payload, {
        TTL: 60,
        urgency: "high",
      })
      .catch(() => null);
  }
}

async function sendPushToUid(db, uid, message) {
  const targetUid = String(uid || "").trim();
  if (!targetUid) return;
  const snap = await db.collection("push_subscriptions").doc(targetUid).get().catch(() => null);
  if (!snap?.exists) return;
  const data = snap.data() || {};
  const tokens = normalizeTokens(data.tokens);
  const webSubscriptions = normalizeWebSubscriptions(data.webSubscriptions);
  await Promise.all([sendExpoPush(tokens, message), sendWebPush(webSubscriptions, message)]);
}

function mapStatus(mollieStatus) {
  const normalized = String(mollieStatus || "").trim().toLowerCase();
  if (normalized === "paid") {
    return { paymentStatus: "paid", paid: true };
  }
  if (normalized === "failed") {
    return { paymentStatus: "failed", paid: false };
  }
  if (normalized === "canceled" || normalized === "cancelled") {
    return { paymentStatus: "canceled", paid: false };
  }
  if (normalized === "expired") {
    return { paymentStatus: "expired", paid: false };
  }
  if (normalized === "open" || normalized === "pending" || normalized === "authorized") {
    return { paymentStatus: "pending_payment", paid: false };
  }
  return { paymentStatus: "open", paid: false };
}

function normalizeStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "cancelled") return "canceled";
  return value;
}

function shouldCancelBookingForPaymentStatus(paymentStatus) {
  return paymentStatus === "canceled" || paymentStatus === "expired";
}

function isBookingActiveStatus(bookingStatus) {
  return (
    bookingStatus === "pending" ||
    bookingStatus === "reschedule_requested" ||
    bookingStatus === "confirmed"
  );
}

function nowServerTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function addCompanyNotification(db, payload) {
  const companyId = String(payload.companyId || "").trim();
  if (!companyId) return;

  await db
    .collection("companies")
    .doc(companyId)
    .collection("notifications")
    .add({
      companyId,
      actorId: String(payload.actorId || "").trim(),
      actorRole: String(payload.actorRole || "customer").trim(),
      type: String(payload.type || "booking_request").trim(),
      title: String(payload.title || "").trim(),
      body: String(payload.body || "").trim(),
      bookingId: String(payload.bookingId || "").trim(),
      serviceId: String(payload.serviceId || "").trim(),
      read: false,
      createdAt: nowServerTs(),
      updatedAt: nowServerTs(),
    });
}

async function addCustomerNotification(db, payload) {
  const customerId = String(payload.customerId || "").trim();
  if (!customerId) return;

  await db
    .collection("users")
    .doc(customerId)
    .collection("notifications")
    .add({
      customerId,
      actorId: String(payload.actorId || "").trim(),
      actorRole: String(payload.actorRole || "company").trim(),
      type: String(payload.type || "booking_created").trim(),
      title: String(payload.title || "").trim(),
      body: String(payload.body || "").trim(),
      bookingId: String(payload.bookingId || "").trim(),
      serviceId: String(payload.serviceId || "").trim(),
      companyId: String(payload.companyId || "").trim(),
      companyName: String(payload.companyName || "").trim(),
      read: false,
      createdAt: nowServerTs(),
      updatedAt: nowServerTs(),
    });
}

async function notifyOnPaidTransition(db, bookingId, bookingData) {
  const companyId = String(bookingData.companyId || "").trim();
  const customerId = String(bookingData.customerId || "").trim();
  const customerName = String(bookingData.customerName || "Een klant").trim() || "Een klant";
  const companyName = String(bookingData.companyName || "de salon").trim() || "de salon";
  const serviceName = String(bookingData.serviceName || "de afspraak").trim() || "de afspraak";
  const serviceId = String(bookingData.serviceId || "").trim();
  const bookingStatus = String(bookingData.status || "").trim().toLowerCase();

  const companyTitle = bookingStatus === "confirmed" ? "Nieuwe boeking" : "Nieuwe boekingsaanvraag";
  const companyBody =
    bookingStatus === "confirmed"
      ? `${customerName} heeft betaald. De boeking is direct bevestigd.`
      : `${customerName} heeft betaald. Deze boeking wacht op je akkoord.`;
  await addCompanyNotification(db, {
    companyId,
    actorId: customerId,
    actorRole: "customer",
    type: "booking_request",
    title: companyTitle,
    body: companyBody,
    bookingId,
    serviceId,
  }).catch(() => null);
  await sendPushToUid(db, companyId, {
    title: companyTitle,
    body: companyBody,
    playSound: true,
    data: {
      role: "company",
      bookingId,
      companyId,
      serviceId,
      notificationType: "booking_request",
    },
  }).catch(() => null);

  const customerType = bookingStatus === "confirmed" ? "booking_confirmed" : "booking_created";
  const customerTitle = bookingStatus === "confirmed" ? "Boeking bevestigd" : "Boeking geplaatst";
  const customerBody =
    bookingStatus === "confirmed"
      ? `Je betaling is gelukt. ${serviceName} bij ${companyName} is bevestigd.`
      : `Je betaling is gelukt. ${serviceName} bij ${companyName} wacht nu op akkoord.`;
  await addCustomerNotification(db, {
    customerId,
    actorId: companyId,
    actorRole: "company",
    type: customerType,
    title: customerTitle,
    body: customerBody,
    bookingId,
    serviceId,
    companyId,
    companyName,
  }).catch(() => null);
  await sendPushToUid(db, customerId, {
    title: customerTitle,
    body: customerBody,
    playSound: true,
    data: {
      role: "customer",
      bookingId,
      companyId,
      serviceId,
      notificationType: customerType,
    },
  }).catch(() => null);
}

async function notifyCustomerOnPaymentProblem(db, bookingId, bookingData, paymentStatus) {
  const customerId = String(bookingData.customerId || "").trim();
  const companyId = String(bookingData.companyId || "").trim();
  const companyName = String(bookingData.companyName || "de salon").trim() || "de salon";
  const serviceId = String(bookingData.serviceId || "").trim();
  const serviceName = String(bookingData.serviceName || "de afspraak").trim() || "de afspraak";

  const byStatus = {
    failed: {
      type: "booking_payment_failed",
      title: "Betaling mislukt",
      body: `Je betaling voor ${serviceName} bij ${companyName} is mislukt. Probeer opnieuw.`,
    },
    canceled: {
      type: "booking_payment_cancelled",
      title: "Betaling geannuleerd",
      body: `Je betaling voor ${serviceName} bij ${companyName} is geannuleerd.`,
    },
    expired: {
      type: "booking_payment_expired",
      title: "Betaling verlopen",
      body: `Je betaling voor ${serviceName} bij ${companyName} is verlopen.`,
    },
  };

  const copy = byStatus[paymentStatus];
  if (!copy) return;

  await addCustomerNotification(db, {
    customerId,
    actorId: companyId,
    actorRole: "company",
    type: copy.type,
    title: copy.title,
    body: copy.body,
    bookingId,
    serviceId,
    companyId,
    companyName,
  }).catch(() => null);
  await sendPushToUid(db, customerId, {
    title: copy.title,
    body: copy.body,
    playSound: false,
    data: {
      role: "customer",
      bookingId,
      companyId,
      serviceId,
      notificationType: copy.type,
    },
  }).catch(() => null);
}

async function findBookingByPaymentId(db, paymentId) {
  const nested = await db
    .collection("bookings")
    .where("mollie.paymentId", "==", paymentId)
    .limit(1)
    .get()
    .catch(() => null);
  if (nested && !nested.empty) return nested.docs[0];

  const topLevel = await db
    .collection("bookings")
    .where("molliePaymentId", "==", paymentId)
    .limit(1)
    .get()
    .catch(() => null);
  if (topLevel && !topLevel.empty) return topLevel.docs[0];

  return null;
}

async function fetchPaymentWithPlatformKey(paymentId) {
  const apiKey = requireEnv("MOLLIE_API_KEY_PLATFORM");
  const client = createMollieClient({ apiKey });
  return client.payments.get(paymentId, { testmode: isTestMode() });
}

async function syncPaymentById(db, paymentId, options = {}) {
  const source = String(options.source || "webhook").trim() || "webhook";
  const cleanPaymentId = String(paymentId || "").trim();
  if (!cleanPaymentId) {
    return {
      ok: false,
      source,
      paymentId: "",
      error: "missing_payment_id",
    };
  }

  const bookingDoc = await findBookingByPaymentId(db, cleanPaymentId);
  if (!bookingDoc) {
    return {
      ok: true,
      source,
      paymentId: cleanPaymentId,
      bookingFound: false,
    };
  }

  const booking = bookingDoc.data() || {};
  const payment = await fetchPaymentWithPlatformKey(cleanPaymentId);
  const statusRaw = String(payment?.status || "").trim().toLowerCase();
  const mapped = mapStatus(statusRaw);
  const previousPaymentStatus = normalizeStatus(booking.paymentStatus || booking?.mollie?.status);
  const bookingStatus = String(booking.status || "").trim().toLowerCase();

  const nowTs = nowServerTs();
  const bookingId = bookingDoc.id;
  const basePatch = {
    paymentStatus: mapped.paymentStatus,
    molliePaymentId: cleanPaymentId,
    mollie: {
      ...(booking.mollie && typeof booking.mollie === "object" ? booking.mollie : {}),
      paymentId: cleanPaymentId,
      status: statusRaw,
      paidAt: payment?.paidAt ? new Date(payment.paidAt) : booking?.mollie?.paidAt || null,
      updatedAt: nowTs,
      lastWebhookAt: nowTs,
    },
    updatedAt: nowTs,
  };

  if (shouldCancelBookingForPaymentStatus(mapped.paymentStatus) && isBookingActiveStatus(bookingStatus)) {
    const batch = db.batch();
    const lockIds = Array.isArray(booking.lockIds)
      ? booking.lockIds.map((row) => String(row || "").trim()).filter(Boolean)
      : [];
    lockIds.forEach((lockId) => {
      batch.delete(db.collection("booking_slot_locks").doc(lockId));
    });
    batch.set(
      bookingDoc.ref,
      {
        ...basePatch,
        status: "cancelled",
        cancellationFeePercent: Number(booking.cancellationFeePercent || 0) || 0,
        cancellationFeeAmount: Number(booking.cancellationFeeAmount || 0) || 0,
        proposalBy: "",
        proposedBookingDate: "",
        proposedStartAt: null,
        proposedEndAt: null,
        proposedOccupiedStartAt: null,
        proposedOccupiedEndAt: null,
        proposedAt: null,
        proposalNote: "",
        lockIds: [],
        lockSeat: null,
      },
      { merge: true }
    );
    await batch.commit();
  } else {
    await bookingDoc.ref.set(basePatch, { merge: true });
  }

  if (mapped.paymentStatus === "paid" && previousPaymentStatus !== "paid") {
    await notifyOnPaidTransition(db, bookingId, { ...booking, paymentStatus: mapped.paymentStatus });
  } else if (
    (mapped.paymentStatus === "failed" || mapped.paymentStatus === "canceled" || mapped.paymentStatus === "expired") &&
    previousPaymentStatus !== mapped.paymentStatus
  ) {
    await notifyCustomerOnPaymentProblem(db, bookingId, booking, mapped.paymentStatus);
  }

  return {
    ok: true,
    source,
    paymentId: cleanPaymentId,
    bookingFound: true,
    bookingId,
    paymentStatus: mapped.paymentStatus,
    mollieStatus: statusRaw,
    previousPaymentStatus,
  };
}

exports.syncPaymentById = syncPaymentById;

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method !== "POST" && method !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const paymentId = parsePaymentId(event);
  console.log("[mollie-webhook] request", { method, hasPaymentId: Boolean(paymentId) });
  if (!paymentId) {
    return response(200, { ok: true });
  }

  try {
    const db = getFirestore();
    const result = await syncPaymentById(db, paymentId, { source: "webhook" });
    if (!result.bookingFound) {
      console.log("[mollie-webhook] booking not found", { paymentId });
      return response(200, { ok: true });
    }

    console.log("[mollie-webhook] processed", {
      bookingId: result.bookingId,
      paymentId: result.paymentId,
      mollieStatus: result.mollieStatus,
      paymentStatus: result.paymentStatus,
      previousPaymentStatus: result.previousPaymentStatus,
    });

    return response(200, { ok: true });
  } catch (error) {
    console.error("[mollie-webhook] processing error", {
      paymentId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return response(200, { ok: true });
  }
};
