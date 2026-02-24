const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  getAppBaseUrl,
  getConnectedMollieClient,
  isTestMode,
  parseBody,
  requireAuthUid,
  requireEnv,
  response,
  toAmountValueFromCents,
  toMollieConfig,
  withAutoRefresh,
} = require("./_mollieConnect");

const DEFAULT_PLATFORM_FEE_PERCENT = 8;

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

function resolvePlatformFeePercent(company) {
  const raw = Number(
    company?.platformFeePercent ??
      company?.mollie?.platformFeePercent ??
      company?.cancellationPolicy?.platformFeePercentRule ??
      DEFAULT_PLATFORM_FEE_PERCENT
  );
  if (!Number.isFinite(raw)) return DEFAULT_PLATFORM_FEE_PERCENT;
  return Math.max(0, Math.min(100, Number(raw.toFixed(2))));
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

  const companySnap = await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) {
    return response(404, { ok: false, error: "Bedrijf niet gevonden." });
  }
  const company = companySnap.data() || {};
  const companyStatus = String(company.status || "").trim().toLowerCase();
  if (companyStatus && companyStatus !== "approved") {
    return response(409, {
      ok: false,
      error: "Bedrijf is nog niet goedgekeurd voor betalingen.",
      companyStatus,
    });
  }

  const mollie = toMollieConfig(company);
  if (!mollie.linked) {
    return response(409, {
      ok: false,
      error: "Bedrijf heeft Mollie nog niet gekoppeld.",
      needsMollieConnect: true,
    });
  }

  const amountCents = pickAmountCentsFromInput(body.amountCents, booking);
  if (amountCents <= 0) {
    return response(400, {
      ok: false,
      error: "Booking amountCents/servicePrice is ongeldig.",
    });
  }

  const platformFeePercent = resolvePlatformFeePercent(company);
  const applicationFeeCents = Math.max(0, Math.floor((amountCents * platformFeePercent) / 100));
  const appBaseUrl = getAppBaseUrl();
  const redirectUrl = `${appBaseUrl}/pay/return?bookingId=${encodeURIComponent(bookingId)}`;
  const webhookUrl = requireEnv("MOLLIE_WEBHOOK_URL");
  const modeTest = isTestMode();

  try {
    const connected = await getConnectedMollieClient(db, companyId);
    /**
     * Mollie Connect platform fee model:
     * - Payment wordt aangemaakt met het connected-account access token.
     * - `applicationFee` zorgt dat de platform commissie automatisch naar BookBeauty gaat.
     * - Restbedrag wordt automatisch aan de connected salon uitbetaald.
     */
    const payment = await withAutoRefresh(db, companyId, connected.mollie, (mollieClient) =>
      mollieClient.payments.create({
        amount: {
          currency: "EUR",
          value: toAmountValueFromCents(amountCents),
        },
        description: `BookBeauty booking ${bookingId}`,
        redirectUrl,
        webhookUrl,
        metadata: {
          bookingId,
          companyId,
          customerId,
          platformFeePercent: String(platformFeePercent),
          applicationFeeCents: String(applicationFeeCents),
        },
        applicationFee:
          applicationFeeCents > 0
            ? {
                amount: {
                  currency: "EUR",
                  value: toAmountValueFromCents(applicationFeeCents),
                },
                description: `BookBeauty platform fee (${platformFeePercent}%)`,
              }
            : undefined,
        testmode: modeTest,
      })
    );

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
          accountType: "connected_oauth",
          organizationId: String(connected.mollie.organizationId || "").trim(),
          platformFeePercent,
          applicationFeeCents,
          applicationFeeValue: toAmountValueFromCents(applicationFeeCents),
          createdAt: nowTs,
          updatedAt: nowTs,
        },
        updatedAt: nowTs,
      },
      { merge: true }
    );

    console.log("[mollie-create-payment] created", {
      bookingId,
      companyId,
      paymentId,
      amountCents,
    });

    return response(200, {
      ok: true,
      checkoutUrl,
      molliePaymentId: paymentId,
      status: paymentStatus,
      amountCents,
      platformFeePercent,
      applicationFeeCents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment aanmaken mislukt.";
    console.error("[mollie-create-payment] failed", {
      bookingId,
      companyId,
      message,
    });
    return response(502, {
      ok: false,
      error: message.slice(0, 500),
    });
  }
};
