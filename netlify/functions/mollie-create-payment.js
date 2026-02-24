const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  getAppBaseUrl,
  getConnectedMollieClient,
  getWebhookUrl,
  isTestMode,
  normalizePercent,
  parseBody,
  requireAuthUid,
  requireEnv,
  response,
  withAutoRefresh,
  toAmountValueFromCents,
} = require("./_mollieConnect");

const DEFAULT_PLATFORM_FEE_PERCENT = 8;

function pickCompanyApprovalStatus(company) {
  const candidates = [
    company?.status,
    company?.approvalStatus,
    company?.reviewStatus,
    company?.moderationStatus,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return candidates[0] || "";
}

function pickBookingAmountCents(booking) {
  const explicit = Number(booking?.amountCents || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const servicePrice = Number(booking?.servicePrice || 0);
  if (Number.isFinite(servicePrice) && servicePrice > 0) {
    return Math.round(servicePrice * 100);
  }

  return 0;
}

function safeBookingDescription(bookingId, booking) {
  const serviceName = String(booking?.serviceName || "").trim();
  const shortId = bookingId.slice(0, 8);
  if (serviceName) return `BookBeauty booking ${shortId} - ${serviceName}`;
  return `BookBeauty booking ${shortId}`;
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
    requireEnv("MOLLIE_OAUTH_CLIENT_ID");
    requireEnv("MOLLIE_OAUTH_CLIENT_SECRET");
    requireEnv("MOLLIE_OAUTH_REDIRECT_URI");
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

  if (
    existingPaymentStatus === "pending_payment" &&
    existingPaymentId &&
    existingCheckoutUrl
  ) {
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

  const companySnap = await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) {
    return response(404, { ok: false, error: "Bedrijf niet gevonden." });
  }
  const company = companySnap.data() || {};

  const companyStatus = pickCompanyApprovalStatus(company);
  if (companyStatus !== "approved") {
    return response(409, {
      ok: false,
      error: `Bedrijf is niet approved (status: ${companyStatus || "missing"}).`,
    });
  }

  const mollieStatus = String(company?.mollie?.status || "").trim().toLowerCase();
  if (mollieStatus !== "linked" || !company?.mollie?.linked) {
    return response(409, {
      ok: false,
      error: "Bedrijf heeft nog geen gekoppelde Mollie account.",
    });
  }

  const amountCents = pickBookingAmountCents(booking);
  if (amountCents <= 0) {
    return response(400, {
      ok: false,
      error: "Booking amountCents/servicePrice is ongeldig.",
    });
  }

  const policy = company?.cancellationPolicy && typeof company.cancellationPolicy === "object"
    ? company.cancellationPolicy
    : {};
  const platformFeePercent = normalizePercent(
    policy.platformFeePercentRule,
    DEFAULT_PLATFORM_FEE_PERCENT
  );
  const platformFeeCents = Math.floor((amountCents * platformFeePercent) / 100);
  if (platformFeeCents >= amountCents) {
    return response(400, {
      ok: false,
      error: "Platform fee is te hoog voor dit bedrag.",
    });
  }

  const returnUrl = `${getAppBaseUrl()}/pay/return?bookingId=${encodeURIComponent(bookingId)}`;
  const webhookUrl = getWebhookUrl();
  const description = safeBookingDescription(bookingId, booking);
  const modeTest = isTestMode();

  try {
    const connected = await getConnectedMollieClient(db, companyId);

    // Mollie Connect OAuth flow:
    // - Payment is created on the connected account (using access token).
    // - applicationFee moves the platform cut (BookBeauty) from that payment.
    // Reference: Payments API `applicationFee` for Mollie Connect OAuth merchants.
    const payment = await withAutoRefresh(db, companyId, connected.mollie, (mollieClient) =>
      mollieClient.payments.create({
        amount: {
          currency: "EUR",
          value: toAmountValueFromCents(amountCents),
        },
        description,
        redirectUrl: returnUrl,
        webhookUrl,
        metadata: {
          bookingId,
          companyId,
          customerId,
          source: "bookbeauty-platform",
          platformFeePercent: String(platformFeePercent),
          amountCents: String(amountCents),
        },
        testmode: modeTest,
        applicationFee: {
          amount: {
            currency: "EUR",
            value: toAmountValueFromCents(platformFeeCents),
          },
          description: `BookBeauty platform fee (${platformFeePercent}%)`,
        },
      })
    );

    const paymentId = String(payment?.id || "").trim();
    const checkoutUrl = String(payment?._links?.checkout?.href || "").trim();
    const paymentStatus = String(payment?.status || "open").trim().toLowerCase();
    if (!paymentId || !checkoutUrl) {
      return response(502, {
        ok: false,
        error: "Mollie payment response mist id of checkout url.",
      });
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    const patch = {
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
        applicationFeeCents: platformFeeCents,
        applicationFeeValue: toAmountValueFromCents(platformFeeCents),
        platformFeePercent,
        mode: modeTest ? "test" : "live",
        webhookUrl,
        redirectUrl: returnUrl,
        createdAt: nowTs,
        updatedAt: nowTs,
      },
      updatedAt: nowTs,
    };

    await bookingRef.set(patch, { merge: true });

    return response(200, {
      ok: true,
      checkoutUrl,
      molliePaymentId: paymentId,
      status: paymentStatus,
      amountCents,
      platformFeeCents,
      platformFeePercent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment aanmaken mislukt.";
    return response(502, {
      ok: false,
      error: message.slice(0, 500),
    });
  }
};
