const { admin, getFirestore } = require("./_firebaseAdmin");

const MOLLIE_API_BASE = "https://api.mollie.com/v2";
const FINAL_BOOKING_STATUSES = new Set(["declined", "cancelled_by_customer", "cancelled_with_fee"]);

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

function resolveApiKey() {
  return (
    String(process.env.MOLLIE_API_KEY_TEST || "").trim() ||
    String(process.env.MOLLIE_API_KEY || "").trim() ||
    ""
  );
}

function parsePaymentId(event) {
  const bodyRaw = typeof event.body === "string" ? event.body : "";
  const headers = event.headers || {};
  const contentType = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyRaw || "{}");
      return String(parsed?.id || "").trim();
    } catch {
      return "";
    }
  }

  const params = new URLSearchParams(bodyRaw);
  const fromBody = String(params.get("id") || "").trim();
  if (fromBody) return fromBody;

  const fromQuery = String(event.queryStringParameters?.id || "").trim();
  return fromQuery;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => String(row || "").trim()).filter(Boolean);
}

function mapBookingStatusFromMollieStatus(status) {
  if (status === "paid") return "confirmed";
  if (status === "failed" || status === "canceled" || status === "expired") return "declined";
  return null;
}

function clearProposalPatch() {
  return {
    proposalBy: "",
    proposedBookingDate: "",
    proposedStartAt: null,
    proposedEndAt: null,
    proposedOccupiedStartAt: null,
    proposedOccupiedEndAt: null,
    proposedAt: null,
    proposalNote: "",
  };
}

function extractBookingIdFromPayment(payment) {
  const metadata = payment?.metadata;
  if (typeof metadata === "string") return metadata.trim();
  if (metadata && typeof metadata === "object") {
    const direct = String(metadata.bookingId || "").trim();
    if (direct) return direct;
    const legacy = String(metadata.booking_id || "").trim();
    if (legacy) return legacy;
  }
  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod === "GET") {
    return response(200, {
      ok: true,
      endpoint: "mollie-webhook",
      accepts: ["POST"],
      message: "Webhook endpoint is actief.",
    });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const paymentId = parsePaymentId(event);
  if (!paymentId) {
    return response(200, {
      ok: true,
      received: false,
      message: "Webhook ontvangen zonder payment id.",
    });
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    return response(500, {
      ok: false,
      error: "MOLLIE_API_KEY_TEST (of MOLLIE_API_KEY) ontbreekt in Netlify env vars.",
    });
  }

  try {
    const paymentRes = await fetch(`${MOLLIE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!paymentRes.ok) {
      const text = await paymentRes.text();
      return response(502, {
        ok: false,
        error: "Mollie payment ophalen mislukt.",
        paymentId,
        details: text.slice(0, 600),
      });
    }

    const payment = await paymentRes.json();
    const mollieStatus = String(payment?.status || "").trim();
    const mappedBookingStatus = mapBookingStatusFromMollieStatus(mollieStatus);
    const bookingId = extractBookingIdFromPayment(payment);

    let bookingUpdated = false;
    let bookingFound = false;
    let nextBookingStatus = "";

    if (bookingId) {
      const db = getFirestore();
      await db.runTransaction(async (transaction) => {
        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists) {
          bookingFound = false;
          return;
        }

        bookingFound = true;
        const booking = bookingSnap.data() || {};
        const currentStatus = String(booking.status || "pending").trim();
        const lockIds = normalizeStringArray(booking.lockIds);
        const now = admin.firestore.FieldValue.serverTimestamp();
        const patch = {
          paymentProvider: "mollie",
          paymentId: String(payment.id || "").trim(),
          paymentStatus: mollieStatus,
          paymentMethod: typeof payment.method === "string" ? payment.method : "",
          paymentAmountValue: String(payment?.amount?.value || ""),
          paymentAmountCurrency: String(payment?.amount?.currency || ""),
          paymentWebhookUpdatedAt: now,
          paymentCheckoutUrl: String(payment?._links?.checkout?.href || ""),
          updatedAt: now,
        };

        if (typeof payment.paidAt === "string" && payment.paidAt.trim()) {
          const paidAt = new Date(payment.paidAt);
          if (!Number.isNaN(paidAt.getTime())) {
            patch.paymentPaidAt = paidAt;
          }
        }

        if (mappedBookingStatus === "confirmed") {
          if (!FINAL_BOOKING_STATUSES.has(currentStatus) && currentStatus !== "confirmed") {
            patch.status = "confirmed";
            patch.companyConfirmedAt = now;
            patch.confirmedAt = now;
            Object.assign(patch, clearProposalPatch());
            bookingUpdated = true;
            nextBookingStatus = "confirmed";
          }
        } else if (mappedBookingStatus === "declined") {
          if (!FINAL_BOOKING_STATUSES.has(currentStatus)) {
            patch.status = "declined";
            Object.assign(patch, clearProposalPatch());
            lockIds.forEach((lockId) => {
              transaction.delete(db.collection("booking_slot_locks").doc(lockId));
            });
            bookingUpdated = true;
            nextBookingStatus = "declined";
          }
        }

        transaction.update(bookingRef, patch);
      });
    }

    console.log(
      JSON.stringify({
        source: "mollie-webhook",
        paymentId: payment.id,
        mollieStatus,
        bookingId: bookingId || null,
        bookingFound,
        bookingUpdated,
        nextBookingStatus: nextBookingStatus || null,
      })
    );

    return response(200, {
      ok: true,
      received: true,
      paymentId: payment.id,
      mollieStatus,
      bookingId: bookingId || "",
      bookingFound,
      bookingUpdated,
      nextBookingStatus,
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Onbekende webhook-fout",
      paymentId,
    });
  }
};
