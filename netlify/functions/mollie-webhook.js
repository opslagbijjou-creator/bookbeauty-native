const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  extractBookingIdFromPayment,
  getConnectedMollieClient,
  isTestMode,
  parseWebhookPaymentId,
  response,
  withAutoRefresh,
} = require("./_mollieConnect");

function mapMollieToPaymentStatus(mollieStatus) {
  const value = String(mollieStatus || "").trim().toLowerCase();
  if (value === "paid") return "paid";
  if (value === "failed") return "failed";
  if (value === "canceled") return "canceled";
  if (value === "expired") return "failed";
  if (value === "authorized") return "pending_payment";
  if (value === "pending") return "pending_payment";
  if (value === "open") return "pending_payment";
  return "pending_payment";
}

function maybeUpdateMainStatus(currentStatus, mappedPaymentStatus) {
  if (mappedPaymentStatus === "paid") return "paid";
  if (mappedPaymentStatus === "failed") return "failed";
  if (mappedPaymentStatus === "canceled") return "canceled";
  return "pending_payment";
}

async function findBookingByPaymentId(db, paymentId) {
  const snap = await db
    .collection("bookings")
    .where("molliePaymentId", "==", paymentId)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0];

  const nestedSnap = await db
    .collection("bookings")
    .where("mollie.paymentId", "==", paymentId)
    .limit(1)
    .get()
    .catch(() => null);
  if (nestedSnap && !nestedSnap.empty) return nestedSnap.docs[0];
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const paymentId = parseWebhookPaymentId(event);
  if (!paymentId) {
    // Mollie verwacht snelle 200 responses; geen error terugsturen voor lege payloads.
    return response(200, { ok: true, received: true, skipped: "missing_payment_id" });
  }

  const db = getFirestore();

  try {
    const bookingDoc = await findBookingByPaymentId(db, paymentId);
    if (!bookingDoc) {
      return response(200, {
        ok: true,
        received: true,
        skipped: "booking_not_found",
        paymentId,
      });
    }

    const bookingId = bookingDoc.id;
    const booking = bookingDoc.data() || {};
    const companyId = String(booking.companyId || "").trim();
    if (!companyId) {
      return response(200, {
        ok: true,
        received: true,
        skipped: "booking_missing_company",
        paymentId,
        bookingId,
      });
    }

    const connected = await getConnectedMollieClient(db, companyId);
    const payment = await withAutoRefresh(db, companyId, connected.mollie, (mollieClient) =>
      mollieClient.payments.get(paymentId, { testmode: isTestMode() })
    );

    const mollieStatus = String(payment?.status || "").trim().toLowerCase();
    const mappedPaymentStatus = mapMollieToPaymentStatus(mollieStatus);
    const metadataBookingId = extractBookingIdFromPayment(payment);
    if (metadataBookingId && metadataBookingId !== bookingId) {
      return response(200, {
        ok: true,
        received: true,
        skipped: "metadata_booking_mismatch",
        paymentId,
      });
    }

    let changed = false;
    await db.runTransaction(async (tx) => {
      const ref = db.collection("bookings").doc(bookingId);
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const current = snap.data() || {};
      const currentMollieStatus = String(current?.mollie?.status || "").trim().toLowerCase();
      const currentPaymentStatus = String(current?.paymentStatus || "").trim().toLowerCase();
      const sameStatus =
        currentMollieStatus === mollieStatus && currentPaymentStatus === mappedPaymentStatus;
      if (sameStatus) return;

      const nowTs = admin.firestore.FieldValue.serverTimestamp();
      const patch = {
        paymentProvider: "mollie",
        paymentStatus: mappedPaymentStatus,
        molliePaymentId: paymentId,
        mollie: {
          ...(current.mollie && typeof current.mollie === "object" ? current.mollie : {}),
          paymentId,
          status: mollieStatus,
          checkoutUrl: String(current?.mollie?.checkoutUrl || payment?._links?.checkout?.href || ""),
          paidAt: payment?.paidAt ? new Date(payment.paidAt) : current?.mollie?.paidAt || null,
          canceledAt: payment?.canceledAt ? new Date(payment.canceledAt) : current?.mollie?.canceledAt || null,
          expiredAt: payment?.expiredAt ? new Date(payment.expiredAt) : current?.mollie?.expiredAt || null,
          amountValue: String(payment?.amount?.value || current?.mollie?.amountValue || ""),
          amountCurrency: String(payment?.amount?.currency || current?.mollie?.amountCurrency || "EUR"),
          updatedAt: nowTs,
          lastWebhookAt: nowTs,
          lastWebhookAtMs: Date.now(),
          webhookCount: Number(current?.mollie?.webhookCount || 0) + 1,
        },
        updatedAt: nowTs,
      };

      const nextMainStatus = maybeUpdateMainStatus(current.status, mappedPaymentStatus);
      patch.status = nextMainStatus;
      const previousMainStatus = String(current.status || "").trim();
      if (
        !current.bookingWorkflowStatus &&
        previousMainStatus &&
        !["pending_payment", "paid", "failed", "canceled", "cancelled"].includes(previousMainStatus.toLowerCase())
      ) {
        patch.bookingWorkflowStatus = previousMainStatus;
      }

      tx.set(ref, patch, { merge: true });
      changed = true;
    });

    return response(200, {
      ok: true,
      received: true,
      paymentId,
      bookingId,
      mollieStatus,
      paymentStatus: mappedPaymentStatus,
      changed,
    });
  } catch (error) {
    // Mollie webhook should still return 200 quickly; retry loops are handled by Mollie.
    return response(200, {
      ok: true,
      received: true,
      paymentId,
      processingError: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
    });
  }
};
