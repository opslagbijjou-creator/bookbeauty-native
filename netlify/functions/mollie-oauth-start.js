const { getFirestore } = require("./_firebaseAdmin");
const {
  OAUTH_STATE_TTL_MS,
  buildOauthAuthorizeUrl,
  canManageCompany,
  generateStateId,
  readInputField,
  requireAuthUid,
  requireEnv,
  response,
} = require("./_mollieConnect");

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  console.log("[mollie-oauth-start] request", { method });

  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method !== "POST" && method !== "GET") {
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
  } catch (error) {
    const reason = String(error instanceof Error ? error.message : "unknown_error")
      .replace(/\s+/g, " ")
      .slice(0, 140);
    console.warn("[mollie-oauth-start] auth failed", {
      message: reason,
    });
    return response(401, {
      ok: false,
      error: `Unauthorized (${reason}). Log opnieuw in en probeer opnieuw.`,
    });
  }

  let companyId = "";
  companyId = String(readInputField(event, "companyId") || "").trim();

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
    console.log("[mollie-oauth-start] state created", {
      companyId,
      actorUid,
      expiresAtMs,
    });

    return response(200, {
      ok: true,
      url: authUrl,
      authUrl,
      stateExpiresAtMs: expiresAtMs,
    });
  } catch (error) {
    console.error("[mollie-oauth-start] failed", {
      companyId,
      actorUid,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Kon OAuth start niet voorbereiden.",
    });
  }
};
