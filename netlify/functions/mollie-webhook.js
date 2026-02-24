const { createMollieClient } = require("@mollie/api-client");
const { getFirestore, admin } = require("./_firebaseAdmin");
const { isTestMode, requireEnv, response } = require("./_mollieConnect");

function parsePaymentIdFromWebhook(event) {
  const bodyRaw = typeof event.body === "string" ? event.body.trim() : "";
  const contentType = String(
    event.headers?.["content-type"] || event.headers?.["Content-Type"] || ""
  ).toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyRaw || "{}");
      return String(parsed?.id || "").trim();
    } catch {
      return "";
    }
  }

  if (bodyRaw.includes("=")) {
    const form = new URLSearchParams(bodyRaw);
    const fromForm = String(form.get("id") || "").trim();
    if (fromForm) return fromForm;
  }

  if (bodyRaw && !bodyRaw.includes("{") && !bodyRaw.includes("=")) {
    return bodyRaw;
  }

  return String(event.queryStringParameters?.id || "").trim();
}

function mapStatus(mollieStatus) {
  const normalized = String(mollieStatus || "").trim().toLowerCase();
  if (normalized === "paid") {
    return { status: "paid", paymentStatus: "paid", paid: true };
  }
  if (normalized === "failed" || normalized === "canceled" || normalized === "expired") {
    return { status: "failed", paymentStatus: "failed", paid: false };
  }
  return { status: "pending_payment", paymentStatus: "pending_payment", paid: false };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const paymentId = parsePaymentIdFromWebhook(event);
  if (!paymentId) {
    return response(200, { ok: true, received: true, skipped: "missing_payment_id" });
  }

  try {
    const apiKey = requireEnv("MOLLIE_API_KEY_PLATFORM");
    const mollieClient = createMollieClient({ apiKey });
    const payment = await mollieClient.payments.get(paymentId, { testmode: isTestMode() });

    const metadata = payment?.metadata && typeof payment.metadata === "object" ? payment.metadata : {};
    const bookingId = String(metadata.bookingId || "").trim();
    if (!bookingId) {
      return response(200, {
        ok: true,
        received: true,
        paymentId,
        skipped: "missing_booking_id_in_metadata",
      });
    }

    const db = getFirestore();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return response(200, {
        ok: true,
        received: true,
        paymentId,
        bookingId,
        skipped: "booking_not_found",
      });
    }

    const paymentStatusRaw = String(payment?.status || "").trim().toLowerCase();
    const mapped = mapStatus(paymentStatusRaw);
    const current = bookingSnap.data() || {};
    const currentStatus = String(current.status || "").trim().toLowerCase();
    const currentPaymentStatus = String(current.paymentStatus || "").trim().toLowerCase();
    const currentPaid = Boolean(current.paid);

    const sameState =
      currentStatus === mapped.status &&
      currentPaymentStatus === mapped.paymentStatus &&
      currentPaid === mapped.paid;
    if (sameState) {
      return response(200, {
        ok: true,
        received: true,
        paymentId,
        bookingId,
        changed: false,
      });
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    await bookingRef.set(
      {
        status: mapped.status,
        paymentStatus: mapped.paymentStatus,
        paid: mapped.paid,
        paymentProvider: "mollie",
        molliePaymentId: paymentId,
        mollie: {
          ...(current.mollie && typeof current.mollie === "object" ? current.mollie : {}),
          paymentId,
          status: paymentStatusRaw,
          paidAt: payment?.paidAt ? new Date(payment.paidAt) : current?.mollie?.paidAt || null,
          updatedAt: nowTs,
          lastWebhookAt: nowTs,
          lastWebhookAtMs: Date.now(),
        },
        updatedAt: nowTs,
      },
      { merge: true }
    );

    return response(200, {
      ok: true,
      received: true,
      paymentId,
      bookingId,
      status: mapped.status,
      changed: true,
    });
  } catch (error) {
    return response(200, {
      ok: true,
      received: true,
      paymentId,
      processingError: error instanceof Error ? error.message.slice(0, 320) : "unknown_error",
    });
  }
};
