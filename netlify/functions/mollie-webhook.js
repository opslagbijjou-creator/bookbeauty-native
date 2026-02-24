const { createMollieClient } = require("@mollie/api-client");
const { getFirestore, admin } = require("./_firebaseAdmin");
const { getConnectedMollieClient, isTestMode, requireEnv, response, withAutoRefresh } = require("./_mollieConnect");

function parsePaymentId(event) {
  const query = event.queryStringParameters || {};
  const fromQuery = String(query.paymentId || query.id || "").trim();
  if (fromQuery) return fromQuery;

  const bodyRaw = typeof event.body === "string" ? event.body.trim() : "";
  if (!bodyRaw) return "";

  const contentType = String(
    event.headers?.["content-type"] || event.headers?.["Content-Type"] || ""
  ).toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyRaw || "{}");
      const fromJson = String(parsed?.id || parsed?.paymentId || "").trim();
      if (fromJson) return fromJson;
    } catch {
      return "";
    }
  }

  if (bodyRaw.includes("=")) {
    const form = new URLSearchParams(bodyRaw);
    const fromForm = String(form.get("id") || form.get("paymentId") || "").trim();
    if (fromForm) return fromForm;
  }

  return "";
}

function mapStatus(mollieStatus) {
  const normalized = String(mollieStatus || "").trim().toLowerCase();
  if (normalized === "paid") {
    return { paymentStatus: "paid", paid: true };
  }
  if (normalized === "failed" || normalized === "canceled" || normalized === "expired") {
    return { paymentStatus: "failed", paid: false };
  }
  return { paymentStatus: "pending_payment", paid: false };
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

async function fetchPaymentForBooking({ db, bookingDoc, paymentId }) {
  const booking = bookingDoc.data() || {};
  const bookingMode = String(booking?.mollie?.mode || "").trim().toLowerCase();
  const envIsTest = String(process.env.MOLLIE_MODE || "").trim().toLowerCase() === "test";

  if (bookingMode === "platform_test" || envIsTest) {
    const apiKey = requireEnv("MOLLIE_API_KEY_PLATFORM");
    const client = createMollieClient({ apiKey });
    return client.payments.get(paymentId, { testmode: isTestMode() });
  }

  const companyId = String(booking.companyId || "").trim();
  if (!companyId) {
    throw new Error("missing_company_id");
  }

  const connected = await getConnectedMollieClient(db, companyId);
  return withAutoRefresh(db, companyId, connected.mollie, (mollieClient) =>
    mollieClient.payments.get(paymentId, { testmode: isTestMode() })
  );
}

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
    return response(200, { ok: true, received: true, skipped: "missing_payment_id" });
  }

  try {
    const db = getFirestore();
    const bookingDoc = await findBookingByPaymentId(db, paymentId);
    if (!bookingDoc) {
      console.log("[mollie-webhook] booking not found", { paymentId });
      return response(200, { ok: true, received: true, skipped: "booking_not_found", paymentId });
    }

    const booking = bookingDoc.data() || {};
    const payment = await fetchPaymentForBooking({ db, bookingDoc, paymentId });
    const statusRaw = String(payment?.status || "").trim().toLowerCase();
    const mapped = mapStatus(statusRaw);

    const currentPaymentStatus = String(booking.paymentStatus || "").trim().toLowerCase();
    const currentMollieStatus = String(booking?.mollie?.status || "").trim().toLowerCase();
    const sameState = currentPaymentStatus === mapped.paymentStatus && currentMollieStatus === statusRaw;
    if (sameState) {
      return response(200, {
        ok: true,
        received: true,
        bookingId: bookingDoc.id,
        paymentId,
        changed: false,
      });
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    await bookingDoc.ref.set(
      {
        paymentStatus: mapped.paymentStatus,
        status: mapped.paymentStatus === "paid" ? "paid" : booking.status || "pending_payment",
        paid: mapped.paid,
        molliePaymentId: paymentId,
        mollie: {
          ...(booking.mollie && typeof booking.mollie === "object" ? booking.mollie : {}),
          paymentId,
          status: statusRaw,
          paidAt: payment?.paidAt ? new Date(payment.paidAt) : booking?.mollie?.paidAt || null,
          updatedAt: nowTs,
          lastWebhookAt: nowTs,
        },
        updatedAt: nowTs,
      },
      { merge: true }
    );

    return response(200, {
      ok: true,
      received: true,
      bookingId: bookingDoc.id,
      paymentId,
      changed: true,
      paymentStatus: mapped.paymentStatus,
    });
  } catch (error) {
    console.error("[mollie-webhook] processing error", {
      paymentId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return response(200, {
      ok: true,
      received: true,
      paymentId,
      processingError: error instanceof Error ? error.message.slice(0, 320) : "unknown_error",
    });
  }
};
