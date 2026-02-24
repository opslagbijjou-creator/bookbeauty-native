const { getFirestore } = require("./_firebaseAdmin");
const { parseBody, response } = require("./_mollieConnect");
const { syncPaymentById } = require("./mollie-webhook");

function readField(event, key) {
  const query = event.queryStringParameters || {};
  if (typeof query[key] === "string" && query[key].trim()) {
    return query[key].trim();
  }
  const body = parseBody(event);
  const value = body && typeof body === "object" ? body[key] : "";
  return String(value || "").trim();
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }
  if (method !== "GET" && method !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const db = getFirestore();
  const bookingId = readField(event, "bookingId");
  let paymentId = readField(event, "paymentId") || readField(event, "id");

  try {
    if (!paymentId && bookingId) {
      const snap = await db.collection("bookings").doc(bookingId).get();
      if (!snap.exists) {
        return response(404, { ok: false, error: "Booking niet gevonden." });
      }
      const data = snap.data() || {};
      const mollieNode = data.mollie && typeof data.mollie === "object" ? data.mollie : {};
      paymentId = String(mollieNode.paymentId || data.molliePaymentId || "").trim();
      if (!paymentId) {
        return response(400, {
          ok: false,
          error: "Geen Mollie paymentId gevonden voor deze booking.",
        });
      }
    }

    if (!paymentId) {
      return response(400, { ok: false, error: "bookingId of paymentId is verplicht." });
    }

    const result = await syncPaymentById(db, paymentId, { source: "manual-sync" });
    return response(200, {
      ok: true,
      bookingId: result.bookingId || bookingId || "",
      paymentId: result.paymentId || paymentId,
      bookingFound: Boolean(result.bookingFound),
      paymentStatus: String(result.paymentStatus || "").trim(),
      mollieStatus: String(result.mollieStatus || "").trim(),
      previousPaymentStatus: String(result.previousPaymentStatus || "").trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kon betalingstatus niet synchroniseren.";
    console.error("[mollie-sync-payment] failed", {
      bookingId,
      hasPaymentId: Boolean(paymentId),
      message: String(message).slice(0, 240),
    });
    return response(500, { ok: false, error: String(message).slice(0, 320) });
  }
};
