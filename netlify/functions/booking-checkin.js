const { getFirestore, admin } = require("./_firebaseAdmin");

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

function parseBody(event) {
  try {
    const raw = typeof event.body === "string" ? event.body : "{}";
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseBearerToken(event) {
  const header =
    String(event.headers?.authorization || "").trim() ||
    String(event.headers?.Authorization || "").trim();
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

async function verifyRequesterUid(event) {
  const token = parseBearerToken(event);
  if (!token) return "";
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return String(decoded?.uid || "").trim();
  } catch {
    return "";
  }
}

function readParam(event, body, key, fallback = "") {
  const query = event.queryStringParameters || {};
  const fromQuery = String(query[key] || "").trim();
  if (fromQuery) return fromQuery;
  const fromBody = String(body[key] || "").trim();
  if (fromBody) return fromBody;
  return fallback;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function normalizePaymentStatus(data) {
  const mollieNode = data.mollie && typeof data.mollie === "object" ? data.mollie : {};
  const raw = String(data.paymentStatus || mollieNode.status || "").trim().toLowerCase();
  if (raw === "cancelled") return "canceled";
  return raw;
}

function paymentSettled(data) {
  const status = normalizePaymentStatus(data);
  if (!status) return true; // legacy bookings
  return status === "paid";
}

function sanitizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function previewPayload(bookingId, data) {
  return {
    id: bookingId,
    companyName: String(data.companyName || "Salon").trim() || "Salon",
    serviceName: String(data.serviceName || "Afspraak").trim() || "Afspraak",
    status: sanitizeStatus(data.status),
  };
}

async function addCheckInNotifications(db, bookingId, bookingData) {
  const companyId = String(bookingData.companyId || "").trim();
  const customerId = String(bookingData.customerId || "").trim();
  const companyName = String(bookingData.companyName || "de salon").trim() || "de salon";
  const serviceName = String(bookingData.serviceName || "de afspraak").trim() || "de afspraak";
  const serviceId = String(bookingData.serviceId || "").trim();
  const customerName = String(bookingData.customerName || "Een klant").trim() || "Een klant";
  const nowTs = admin.firestore.FieldValue.serverTimestamp();

  if (companyId) {
    await db
      .collection("companies")
      .doc(companyId)
      .collection("notifications")
      .add({
        companyId,
        actorId: customerId,
        actorRole: "customer",
        type: "booking_checked_in",
        title: "Klant heeft ingecheckt",
        body: `${customerName} heeft ingecheckt voor ${serviceName}.`,
        bookingId,
        serviceId,
        read: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .catch(() => null);
  }

  if (customerId) {
    await db
      .collection("users")
      .doc(customerId)
      .collection("notifications")
      .add({
        customerId,
        actorId: companyId,
        actorRole: "company",
        type: "booking_checked_in",
        title: "Aankomst bevestigd",
        body: `Je bent ingecheckt voor ${serviceName} bij ${companyName}.`,
        bookingId,
        serviceId,
        companyId,
        companyName,
        read: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      .catch(() => null);
  }
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  if (method === "OPTIONS") return response(204, { ok: true });
  if (method !== "GET" && method !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const body = parseBody(event);
  const action = readParam(event, body, "action", method === "GET" ? "preview" : "confirm").toLowerCase();
  const bookingId = readParam(event, body, "bookingId", readParam(event, body, "id", ""));
  const code = readParam(event, body, "code", readParam(event, body, "checkInCode", ""));

  if (!bookingId || !code) {
    return response(400, { ok: false, error: "bookingId en code zijn verplicht." });
  }

  try {
    const db = getFirestore();
    const requesterUid = await verifyRequesterUid(event);
    if (!requesterUid) {
      return response(401, { ok: false, error: "Log in om check-in te openen." });
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return response(404, { ok: false, error: "Boeking niet gevonden." });
    }

    const data = bookingSnap.data() || {};
    const customerId = String(data.customerId || "").trim();
    if (!customerId || requesterUid !== customerId) {
      return response(403, { ok: false, error: "Alleen de klant van deze afspraak kan deze QR gebruiken." });
    }

    const status = sanitizeStatus(data.status);
    const activeCode = String(data.checkInCode || "").trim();
    const lastCode = String(data.checkInLastCode || "").trim();
    const expiresAtMs = toMillis(data.checkInCodeExpiresAt);
    const nowMs = Date.now();

    if (action === "preview") {
      const validCode =
        code === activeCode || (status === "checked_in" && lastCode && code === lastCode);
      if (!validCode) {
        return response(403, { ok: false, error: "Ongeldige check-in code." });
      }
      if (status === "confirmed" && expiresAtMs && expiresAtMs < nowMs) {
        return response(410, { ok: false, error: "Deze check-in code is verlopen." });
      }
      return response(200, {
        ok: true,
        booking: previewPayload(bookingId, data),
        canConfirm: status === "confirmed",
        alreadyCheckedIn: status === "checked_in",
      });
    }

    if (action === "confirm") {
      if (!paymentSettled(data)) {
        return response(409, { ok: false, error: "Check-in kan pas nadat de betaling is afgerond." });
      }

      if (status === "checked_in") {
        return response(200, {
          ok: true,
          booking: previewPayload(bookingId, data),
          alreadyCheckedIn: true,
        });
      }

      if (status !== "confirmed") {
        return response(409, { ok: false, error: "Deze afspraak kan nu niet ingecheckt worden." });
      }

      if (!activeCode || code !== activeCode) {
        return response(403, { ok: false, error: "Ongeldige check-in code." });
      }

      if (expiresAtMs && expiresAtMs < nowMs) {
        return response(410, { ok: false, error: "Deze check-in code is verlopen." });
      }

      const nowTs = admin.firestore.FieldValue.serverTimestamp();
      await bookingRef.set(
        {
          status: "checked_in",
          checkInConfirmedAt: nowTs,
          checkInCodeLast: activeCode,
          checkInCode: "",
          checkInCodeExpiresAt: null,
          checkInRejectedAt: null,
          checkInRejectedReason: "",
          updatedAt: nowTs,
        },
        { merge: true }
      );

      await addCheckInNotifications(db, bookingId, data);

      return response(200, {
        ok: true,
        booking: {
          ...previewPayload(bookingId, data),
          status: "checked_in",
        },
        checkedIn: true,
      });
    }

    return response(400, { ok: false, error: "Ongeldige action. Gebruik preview of confirm." });
  } catch (error) {
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Check-in mislukt.",
    });
  }
};
