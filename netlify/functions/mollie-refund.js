const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  getConnectedMollieClient,
  isTestMode,
  normalizePercent,
  parseBody,
  requireAuthUid,
  response,
  toAmountValueFromCents,
  withAutoRefresh,
} = require("./_mollieConnect");

const DEFAULT_HOLD_PERCENT = 15;
const DEFAULT_PLATFORM_FEE_PERCENT_RULE = 8;
const DEFAULT_LATE_WINDOW_HOURS = 24;

function canActorRefund({ actorUid, actorRole, booking, company }) {
  if (actorRole === "admin") return true;
  const customerId = String(booking?.customerId || "").trim();
  if (actorUid && actorUid === customerId) return true;

  const companyId = String(booking?.companyId || "").trim();
  if (actorUid && actorUid === companyId) return true;

  const ownerId = String(company?.ownerId || "").trim();
  if (actorUid && ownerId && actorUid === ownerId) return true;

  return false;
}

function computeBreakdown({
  totalCents,
  cancelType,
  holdPercent,
  platformFeePercentRule,
}) {
  const isLate = cancelType === "late";
  const safeTotal = Math.max(0, Math.floor(Number(totalCents) || 0));
  const safeHoldPercent = normalizePercent(holdPercent, DEFAULT_HOLD_PERCENT);
  const safePlatformRule = normalizePercent(platformFeePercentRule, DEFAULT_PLATFORM_FEE_PERCENT_RULE);

  const holdCents = isLate ? Math.floor((safeTotal * safeHoldPercent) / 100) : 0;
  const refundedCents = Math.max(0, safeTotal - holdCents);
  const platformKeptCents = Math.floor((holdCents * safePlatformRule) / 100);
  const companyKeptCents = Math.max(0, holdCents - platformKeptCents);

  return {
    holdPercent: safeHoldPercent,
    platformFeePercentRule: safePlatformRule,
    holdCents,
    refundedCents,
    platformKeptCents,
    companyKeptCents,
    lateCancel: isLate,
  };
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
    actorUid = await requireAuthUid(event);
  } catch {
    return response(401, { ok: false, error: "Unauthorized" });
  }

  const body = parseBody(event);
  const bookingId = String(body.bookingId || "").trim();
  const cancelReason = String(body.cancelReason || "").trim();
  const cancelType = String(body.cancelType || "normal").trim().toLowerCase() === "late" ? "late" : "normal";
  const requestedBy = String(body.requestedBy || "").trim().toLowerCase() || "customer";

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
  const paymentId = String(booking?.mollie?.paymentId || booking.molliePaymentId || "").trim();
  if (!companyId || !paymentId) {
    return response(400, {
      ok: false,
      error: "Booking heeft geen gekoppelde Mollie paymentId/companyId.",
    });
  }

  const userSnap = await db.collection("users").doc(actorUid).get().catch(() => null);
  const actorRole = String(userSnap?.data()?.role || "").trim().toLowerCase();

  const companySnap = await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) {
    return response(404, { ok: false, error: "Bedrijf niet gevonden." });
  }
  const company = companySnap.data() || {};

  if (!canActorRefund({ actorUid, actorRole, booking, company })) {
    return response(403, { ok: false, error: "Geen toegang om refund uit te voeren." });
  }

  const alreadyRefundedId = String(booking?.mollie?.refundId || "").trim();
  if (alreadyRefundedId) {
    return response(200, {
      ok: true,
      alreadyRefunded: true,
      bookingId,
      mollieRefundId: alreadyRefundedId,
    });
  }

  const policy = company?.cancellationPolicy && typeof company.cancellationPolicy === "object"
    ? company.cancellationPolicy
    : {};
  const holdPercent = normalizePercent(policy.holdPercent, DEFAULT_HOLD_PERCENT);
  const platformFeePercentRule = normalizePercent(
    policy.platformFeePercentRule,
    DEFAULT_PLATFORM_FEE_PERCENT_RULE
  );
  const lateWindowHours = Math.max(0, Number(policy.lateWindowHours || DEFAULT_LATE_WINDOW_HOURS) || DEFAULT_LATE_WINDOW_HOURS);

  const totalCentsExplicit = Number(booking.amountCents || 0);
  const totalCents =
    Number.isFinite(totalCentsExplicit) && totalCentsExplicit > 0
      ? Math.floor(totalCentsExplicit)
      : Math.max(0, Math.round(Number(booking.servicePrice || 0) * 100));
  if (totalCents <= 0) {
    return response(400, { ok: false, error: "Booking bedrag is ongeldig." });
  }

  const breakdown = computeBreakdown({
    totalCents,
    cancelType,
    holdPercent,
    platformFeePercentRule,
  });

  if (breakdown.refundedCents <= 0) {
    return response(400, {
      ok: false,
      error: "Refund bedrag is 0. Geen partial/full refund aangemaakt.",
    });
  }

  try {
    const connected = await getConnectedMollieClient(db, companyId);
    const refund = await withAutoRefresh(db, companyId, connected.mollie, (mollieClient) =>
      mollieClient.paymentRefunds.create({
        paymentId,
        amount: {
          currency: "EUR",
          value: toAmountValueFromCents(breakdown.refundedCents),
        },
        description:
          cancelType === "late"
            ? `Late cancellation refund (${toAmountValueFromCents(breakdown.refundedCents)} EUR)`
            : `Cancellation refund (${toAmountValueFromCents(breakdown.refundedCents)} EUR)`,
        metadata: {
          bookingId,
          companyId,
          requestedBy,
          cancelType,
          cancelReason,
          holdPercent: String(breakdown.holdPercent),
          platformFeePercentRule: String(breakdown.platformFeePercentRule),
          holdCents: String(breakdown.holdCents),
        },
        testmode: isTestMode(),
      })
    );

    const refundId = String(refund?.id || "").trim();
    if (!refundId) {
      return response(502, { ok: false, error: "Mollie refund response mist id." });
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    const nextMainStatus = breakdown.holdCents > 0 ? "cancelled" : "refunded";
    const legacyCancellationStatus = breakdown.holdCents > 0 ? "cancelled_with_fee" : "cancelled_by_customer";

    await bookingRef.set(
      {
        status: nextMainStatus,
        paymentStatus: "refunded",
        bookingWorkflowStatus:
          booking.bookingWorkflowStatus ||
          (typeof booking.status === "string" ? booking.status : ""),
        legacyCancellationStatus,
        cancellationFeePercent: breakdown.holdPercent,
        cancellationFeeAmount: breakdown.holdCents / 100,
        cancellationPolicySnapshot: {
          lateWindowHours,
          holdPercent: breakdown.holdPercent,
          platformFeePercentRule: breakdown.platformFeePercentRule,
        },
        breakdown: {
          totalCents,
          holdCents: breakdown.holdCents,
          platformKeptCents: breakdown.platformKeptCents,
          companyKeptCents: breakdown.companyKeptCents,
          refundedCents: breakdown.refundedCents,
        },
        totalCents,
        holdCents: breakdown.holdCents,
        platformKeptCents: breakdown.platformKeptCents,
        companyKeptCents: breakdown.companyKeptCents,
        refundedCents: breakdown.refundedCents,
        mollieRefundId: refundId,
        mollie: {
          ...(booking.mollie && typeof booking.mollie === "object" ? booking.mollie : {}),
          paymentId,
          refundId,
          refundStatus: String(refund?.status || "").trim(),
          refundedCents: breakdown.refundedCents,
          holdCents: breakdown.holdCents,
          platformKeptCents: breakdown.platformKeptCents,
          companyKeptCents: breakdown.companyKeptCents,
          legacyCancellationStatus,
          cancelType,
          cancelReason,
          requestedBy,
          refundedAt: nowTs,
          updatedAt: nowTs,
        },
        updatedAt: nowTs,
      },
      { merge: true }
    );

    return response(200, {
      ok: true,
      bookingId,
      mollieRefundId: refundId,
      status: nextMainStatus,
      totalCents,
      holdCents: breakdown.holdCents,
      platformKeptCents: breakdown.platformKeptCents,
      companyKeptCents: breakdown.companyKeptCents,
      refundedCents: breakdown.refundedCents,
    });
  } catch (error) {
    return response(502, {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 400) : "Refund mislukt",
    });
  }
};
