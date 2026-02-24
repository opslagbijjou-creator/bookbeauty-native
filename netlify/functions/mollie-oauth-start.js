const { getFirestore } = require("./_firebaseAdmin");
const {
  OAUTH_STATE_TTL_MS,
  buildOauthAuthorizeUrl,
  canManageCompany,
  generateStateId,
  requireAuthUid,
  requireEnv,
  response,
} = require("./_mollieConnect");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  try {
    requireEnv("MOLLIE_OAUTH_CLIENT_ID");
    requireEnv("MOLLIE_OAUTH_CLIENT_SECRET");
    requireEnv("MOLLIE_OAUTH_REDIRECT_URI");
    requireEnv("APP_BASE_URL");
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

  let companyId = "";
  try {
    const bodyRaw = typeof event.body === "string" ? event.body : "{}";
    const parsed = JSON.parse(bodyRaw);
    companyId = String(parsed?.companyId || "").trim();
  } catch {
    companyId = "";
  }

  if (!companyId) {
    return response(400, { ok: false, error: "companyId is verplicht." });
  }

  const db = getFirestore();
  const canManage = await canManageCompany(db, companyId, actorUid).catch(() => false);
  if (!canManage) {
    return response(403, { ok: false, error: "Geen toegang voor dit bedrijf." });
  }

  try {
    const state = generateStateId();
    const nowMs = Date.now();
    const expiresAtMs = nowMs + OAUTH_STATE_TTL_MS;

    await db.collection("oauthStates").doc(state).set({
      state,
      provider: "mollie",
      companyId,
      actorUid,
      createdAt: new Date(nowMs),
      createdAtMs: nowMs,
      expiresAt: new Date(expiresAtMs),
      expiresAtMs,
      consumed: false,
    });

    const authUrl = buildOauthAuthorizeUrl({ state });

    return response(200, {
      ok: true,
      authUrl,
      stateExpiresAtMs: expiresAtMs,
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Kon OAuth start niet voorbereiden.",
    });
  }
};
