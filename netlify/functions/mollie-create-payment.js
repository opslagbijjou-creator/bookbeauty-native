const { createMollieClient } = require("@mollie/api-client");
const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  isTestMode,
  parseBody,
  requireAuthUid,
  requireEnv,
  response,
  toAmountValueFromCents,
} = require("./_mollieConnect");

function pickBookingAmountCents(booking) {
  const explicit = Number(booking?.amountCents || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const servicePrice = Number(booking?.servicePrice || 0);
  if (Number.isFinite(servicePrice) && servicePrice > 0) {
    return Math.round(servicePrice * 100);
  }

  return 0;
}

function pickAmountCentsFromInput(inputValue, booking) {
  const fromInput = Number(inputValue || 0);
  if (Number.isFinite(fromInput) && fromInput > 0) return Math.floor(fromInput);
  return pickBookingAmountCents(booking);
}

function resolveCheckoutUrl(payment) {
  if (payment && typeof payment.getCheckoutUrl === "function") {
    const byMethod = String(payment.getCheckoutUrl() || "").trim();
    if (byMethod) return byMethod;
  }
  return String(payment?._links?.checkout?.href || "").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  try {
    requireEnv("APP_BASE_URL");
    requireEnv("MOLLIE_WEBHOOK_URL");
    requireEnv("MOLLIE_MODE");
    requireEnv("MOLLIE_API_KEY_PLATFORM");
  } catch (error) {
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Missing env vars",
    });
  }

  let actorUid = "";
  try {
    actorUid = await requireAuthUid(event);
  } catch {
    return response(401, { ok: false, error: "Unauthorized" });
  }

  const body = parseBody(event);
  const bookingId = String(body.bookingId || "").trim();
  if (!bookingId) {
    return response(400, { ok: false, error: "bookingId is verplicht." });
  }

  const db = getFirestore();
  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    return response(404, { ok: false, error: "Booking niet gevonden." });
  }

  const booking = bookingSnap.data() || {};
  const companyId = String(booking.companyId || "").trim();
  if (!companyId) {
    return response(400, { ok: false, error: "Booking mist companyId." });
  }

  const existingPaymentStatus = String(booking.paymentStatus || "").trim().toLowerCase();
  const existingPaymentId = String(booking?.mollie?.paymentId || booking.molliePaymentId || "").trim();
  const existingCheckoutUrl = String(booking?.mollie?.checkoutUrl || "").trim();

  if (existingPaymentStatus === "paid") {
    return response(409, {
      ok: false,
      error: "Deze booking is al betaald.",
      paymentStatus: "paid",
      molliePaymentId: existingPaymentId || undefined,
    });
  }

  if (existingPaymentStatus === "pending_payment" && existingPaymentId && existingCheckoutUrl) {
    return response(200, {
      ok: true,
      existing: true,
      checkoutUrl: existingCheckoutUrl,
      molliePaymentId: existingPaymentId,
      status: String(booking?.mollie?.status || "open").trim().toLowerCase() || "open",
    });
  }

  const actorRoleSnap = await db.collection("users").doc(actorUid).get().catch(() => null);
  const actorRole = String(actorRoleSnap?.data()?.role || "").trim().toLowerCase();
  const customerId = String(booking.customerId || "").trim();

  const canPay =
    actorRole === "admin" ||
    actorUid === customerId ||
    actorUid === companyId ||
    String(booking.createdBy || "").trim() === actorUid;
  if (!canPay) {
    return response(403, { ok: false, error: "Geen toegang om deze betaling te starten." });
  }

  const amountCents = pickAmountCentsFromInput(body.amountCents, booking);
  if (amountCents <= 0) {
    return response(400, {
      ok: false,
      error: "Booking amountCents/servicePrice is ongeldig.",
    });
  }

  const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
  const redirectUrl = `${appBaseUrl}/bookings/${encodeURIComponent(bookingId)}?paid=1`;
  const webhookUrl = requireEnv("MOLLIE_WEBHOOK_URL");
  const modeTest = isTestMode();
  const apiKey = requireEnv("MOLLIE_API_KEY_PLATFORM");

  try {
    const mollieClient = createMollieClient({ apiKey });
    const payment = await mollieClient.payments.create({
      amount: {
        currency: "EUR",
        value: toAmountValueFromCents(amountCents),
      },
      description: `BookBeauty booking ${bookingId}`,
      redirectUrl,
      webhookUrl,
      metadata: {
        bookingId,
      },
      testmode: modeTest,
    });

    const paymentId = String(payment?.id || "").trim();
    const checkoutUrl = resolveCheckoutUrl(payment);
    const paymentStatus = String(payment?.status || "open").trim().toLowerCase();
    if (!paymentId || !checkoutUrl) {
      return response(502, {
        ok: false,
        error: "Mollie payment response mist id of checkout url.",
      });
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    await bookingRef.set(
      {
        amountCents,
        paymentProvider: "mollie",
        paymentStatus: "pending_payment",
        status: "pending_payment",
        bookingWorkflowStatus:
          booking.bookingWorkflowStatus ||
          (typeof booking.status === "string" ? booking.status : ""),
        molliePaymentId: paymentId,
        mollie: {
          paymentId,
          status: paymentStatus,
          checkoutUrl,
          amountCents,
          amountValue: toAmountValueFromCents(amountCents),
          mode: modeTest ? "test" : "live",
          webhookUrl,
          redirectUrl,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
        updatedAt: nowTs,
      },
      { merge: true }
    );

    return response(200, {
      ok: true,
      checkoutUrl,
      molliePaymentId: paymentId,
      status: paymentStatus,
      amountCents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment aanmaken mislukt.";
    return response(502, {
      ok: false,
      error: message.slice(0, 500),
    });
  }
};
