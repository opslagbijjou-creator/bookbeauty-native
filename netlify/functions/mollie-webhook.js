const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  extractBookingIdFromPayment,
  getConnectedMollieClient,
  isTestMode,
  parseWebhookPaymentId,
  response,
  withAutoRefresh,
} = require("./_mollieConnect");

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

async function findBookingByPaymentId(db, paymentId) {
  const byTopLevel = await db
    .collection("bookings")
    .where("molliePaymentId", "==", paymentId)
    .limit(1)
    .get();
  if (!byTopLevel.empty) {
    return byTopLevel.docs[0];
  }

  const byNested = await db
    .collection("bookings")
    .where("mollie.paymentId", "==", paymentId)
    .limit(1)
    .get()
    .catch(() => null);
  if (byNested && !byNested.empty) {
    return byNested.docs[0];
  }

  return null;
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method !== "POST" && method !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const paymentId = parseWebhookPaymentId(event);
  console.log("[mollie-webhook] request", { method, hasPaymentId: Boolean(paymentId) });
  if (!paymentId) {
    return response(200, { ok: true, received: true, skipped: "missing_payment_id" });
  }

  try {
    const db = getFirestore();
    const bookingDoc = await findBookingByPaymentId(db, paymentId);
    if (!bookingDoc) {
      return response(200, {
        ok: true,
        received: true,
        paymentId,
        skipped: "booking_not_found_for_payment",
      });
    }

    const bookingId = bookingDoc.id;
    const current = bookingDoc.data() || {};
    const companyId = String(current.companyId || "").trim();
    if (!companyId) {
      return response(200, {
        ok: true,
        received: true,
        paymentId,
        bookingId,
        skipped: "missing_company_id",
      });
    }

    const connected = await getConnectedMollieClient(db, companyId);
    const payment = await withAutoRefresh(db, companyId, connected.mollie, (mollieClient) =>
      mollieClient.payments.get(paymentId, { testmode: isTestMode() })
    );

    const metadataBookingId = extractBookingIdFromPayment(payment);
    const resolvedBookingId = metadataBookingId || bookingId;
    if (resolvedBookingId !== bookingId) {
      return response(200, {
        ok: true,
        received: true,
        paymentId,
        bookingId,
        skipped: "booking_id_mismatch",
      });
    }

    const paymentStatusRaw = String(payment?.status || "").trim().toLowerCase();
    const mapped = mapStatus(paymentStatusRaw);
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
    await bookingDoc.ref.set(
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

    console.log("[mollie-webhook] booking updated", {
      bookingId,
      companyId,
      paymentId,
      status: mapped.status,
    });

    return response(200, {
      ok: true,
      received: true,
      paymentId,
      bookingId,
      status: mapped.status,
      changed: true,
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
