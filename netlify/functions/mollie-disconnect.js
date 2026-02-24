const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  canManageCompany,
  parseBody,
  readInputField,
  requireAuthUid,
  response,
} = require("./_mollieConnect");

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  console.log("[mollie-disconnect] request", { method });

  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method !== "POST" && method !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  let actorUid = "";
  try {
    actorUid = await requireAuthUid(event);
  } catch {
    return response(401, { ok: false, error: "Unauthorized" });
  }

  const body = parseBody(event);
  const companyId = String(body.companyId || readInputField(event, "companyId") || "").trim();
  if (!companyId) {
    return response(400, { ok: false, error: "companyId is verplicht." });
  }

  const db = getFirestore();
  const canManage = await canManageCompany(db, companyId, actorUid).catch(() => false);
  if (!canManage) {
    return response(403, { ok: false, error: "Geen toegang voor dit bedrijf." });
  }

  const companyRef = db.collection("companies").doc(companyId);
  await companyRef.set(
    {
      mollie: {
        linked: false,
        status: "disconnected",
        accessTokenEncrypted: admin.firestore.FieldValue.delete(),
        refreshTokenEncrypted: admin.firestore.FieldValue.delete(),
        accessTokenStorageMode: admin.firestore.FieldValue.delete(),
        refreshTokenStorageMode: admin.firestore.FieldValue.delete(),
        tokenType: admin.firestore.FieldValue.delete(),
        scope: admin.firestore.FieldValue.delete(),
        tokenExpiresAtMs: admin.firestore.FieldValue.delete(),
        tokenExpiresAt: admin.firestore.FieldValue.delete(),
        organizationId: admin.firestore.FieldValue.delete(),
        organizationName: admin.firestore.FieldValue.delete(),
        profileId: admin.firestore.FieldValue.delete(),
        onboardingStatus: admin.firestore.FieldValue.delete(),
        canReceivePayments: false,
        canReceiveSettlements: false,
        dashboardOnboardingUrl: admin.firestore.FieldValue.delete(),
        disconnectedByUid: actorUid,
        disconnectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("[mollie-disconnect] disconnected", { companyId, actorUid });
  return response(200, { ok: true, companyId, status: "disconnected" });
};
