const { createMollieClient } = require("@mollie/api-client");
const { getFirestore, admin } = require("./_firebaseAdmin");
const { parseBody, requireEnv, response, toAmountValueFromCents } = require("./_mollieConnect");

function toSafeInt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function resolveCheckoutUrl(payment) {
  const fromLinks = String(payment?._links?.checkout?.href || "").trim();
  if (fromLinks) return fromLinks;
  if (payment && typeof payment.getCheckoutUrl === "function") {
    return String(payment.getCheckoutUrl() || "").trim();
  }
  return "";
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  console.log("[mollie-create-payment] request", { method });

  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }
  if (method !== "POST") {
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

  const body = parseBody(event);
  const bookingId = String(body.bookingId || "").trim();
  const companyId = String(body.companyId || "").trim();
  const amountCents = toSafeInt(body.amountCents);

  if (!bookingId || !companyId || amountCents <= 0) {
    return response(400, {
      ok: false,
      error: "Verplichte velden ontbreken: bookingId, companyId, amountCents.",
    });
  }

  const db = getFirestore();
  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    return response(404, { ok: false, error: "Booking niet gevonden." });
  }

  const booking = bookingSnap.data() || {};
  const bookingCompanyId = String(booking.companyId || "").trim();
  if (bookingCompanyId && bookingCompanyId !== companyId) {
    return response(400, {
      ok: false,
      error: "companyId komt niet overeen met booking.companyId.",
    });
  }

  const platformFeeCents = Math.round(amountCents * 0.08);
  const salonNetCents = amountCents - platformFeeCents;
  const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
  const webhookUrl = requireEnv("MOLLIE_WEBHOOK_URL");
  const apiKey = requireEnv("MOLLIE_API_KEY_PLATFORM");

  try {
    const mollie = createMollieClient({ apiKey });
    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value: toAmountValueFromCents(amountCents) },
      description: "BookBeauty test booking",
      redirectUrl: `${appBaseUrl}/payment-result?bookingId=${encodeURIComponent(bookingId)}`,
      webhookUrl,
      metadata: {
        bookingId,
        companyId,
        platformFeeCents,
        salonNetCents,
      },
    });

    const paymentId = String(payment?.id || "").trim();
    const checkoutUrl = resolveCheckoutUrl(payment);
    if (!paymentId || !checkoutUrl) {
      return response(502, {
        ok: false,
        error: "Mollie response mist paymentId of checkoutUrl.",
      });
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    await bookingRef.set(
      {
        paymentStatus: "pending_payment",
        mollie: {
          paymentId,
          mode: "platform_only",
          status: "open",
          checkoutUrl,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
        breakdown: {
          amountCents,
          platformFeeCents,
          salonNetCents,
        },
        updatedAt: nowTs,
      },
      { merge: true }
    );

    console.log("[mollie-create-payment] created", {
      bookingId,
      paymentId,
      amountCents,
      platformFeeCents,
      salonNetCents,
    });

    return response(200, {
      ok: true,
      checkoutUrl: payment._links?.checkout?.href || checkoutUrl,
      paymentId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment aanmaken mislukt.";
    console.error("[mollie-create-payment] failed", {
      bookingId,
      companyId,
      message: String(message).slice(0, 240),
    });
    return response(502, {
      ok: false,
      error: String(message).slice(0, 320),
    });
  }
};
