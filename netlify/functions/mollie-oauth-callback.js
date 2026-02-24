const { getFirestore } = require("./_firebaseAdmin");
const {
  exchangeAuthorizationCode,
  getAppBaseUrl,
  getConnectedMollieClient,
  isTestMode,
  redirect,
  response,
  saveCompanyMollieTokens,
} = require("./_mollieConnect");

function buildFrontendRedirect(path, params = {}) {
  const base = getAppBaseUrl();
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    query.set(key, text);
  });

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const suffix = query.toString();
  return `${base}${normalizedPath}${suffix ? `?${suffix}` : ""}`;
}

async function consumeOAuthState(db, state) {
  const stateRef = db.collection("oauthStates").doc(state);
  let stateData = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    if (!snap.exists) {
      throw new Error("INVALID_STATE");
    }
    const row = snap.data() || {};
    const consumed = Boolean(row.consumed);
    const expiresAtMs = Number(row.expiresAtMs || 0);
    const companyId = String(row.companyId || "").trim();
    if (consumed || !companyId || !expiresAtMs || expiresAtMs < Date.now()) {
      throw new Error("STATE_EXPIRED");
    }

    tx.update(stateRef, {
      consumed: true,
      consumedAt: new Date(),
      consumedAtMs: Date.now(),
    });
    stateData = {
      companyId,
      actorUid: String(row.actorUid || "").trim(),
      createdAtMs: Number(row.createdAtMs || 0),
    };
  });

  return stateData;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const query = event.queryStringParameters || {};
  const state = String(query.state || "").trim();
  const code = String(query.code || "").trim();
  const oauthError = String(query.error || "").trim();
  const oauthErrorDescription = String(query.error_description || "").trim();

  if (oauthError) {
    const destination = buildFrontendRedirect("/settings/payments", {
      linked: 0,
      reason: oauthError,
      detail: oauthErrorDescription,
    });
    return redirect(302, destination);
  }

  if (!state || !code) {
    const destination = buildFrontendRedirect("/settings/payments", {
      linked: 0,
      reason: "missing_code_or_state",
    });
    return redirect(302, destination);
  }

  const db = getFirestore();

  let consumed = null;
  try {
    consumed = await consumeOAuthState(db, state);
  } catch (error) {
    const destination = buildFrontendRedirect("/settings/payments", {
      linked: 0,
      reason: error instanceof Error ? error.message.toLowerCase() : "invalid_state",
    });
    return redirect(302, destination);
  }

  const companyId = String(consumed?.companyId || "").trim();
  if (!companyId) {
    const destination = buildFrontendRedirect("/settings/payments", {
      linked: 0,
      reason: "invalid_company_id",
    });
    return redirect(302, destination);
  }

  try {
    const tokenPayload = await exchangeAuthorizationCode(code);
    const tokenExpiresAtMs = await saveCompanyMollieTokens(db, companyId, tokenPayload, {
      mollie: {
        model: "platform",
        linked: true,
        status: "linked",
      },
    });

    const connected = await getConnectedMollieClient(db, companyId);
    const org = await connected.client.organizations.getCurrent().catch(() => null);
    const onboarding = await connected.client.onboarding
      .get({ testmode: isTestMode() })
      .catch(() => null);

    await db
      .collection("companies")
      .doc(companyId)
      .set(
        {
          mollie: {
            linked: true,
            status: "linked",
            model: "platform",
            organizationId: String(org?.id || "").trim(),
            organizationName: String(org?.name || "").trim(),
            tokenExpiresAtMs,
            tokenExpiresAt: tokenExpiresAtMs > 0 ? new Date(tokenExpiresAtMs) : null,
            scope: String(tokenPayload?.scope || "").trim(),
            onboardingStatus: String(onboarding?.status || "").trim(),
            canReceivePayments: Boolean(onboarding?.canReceivePayments),
            canReceiveSettlements: Boolean(onboarding?.canReceiveSettlements),
            dashboardOnboardingUrl: String(onboarding?._links?.dashboard?.href || "").trim(),
            linkedAt: new Date(),
            updatedAt: new Date(),
          },
          updatedAt: new Date(),
        },
        { merge: true }
      );

    await db.collection("oauthStates").doc(state).delete().catch(() => null);

    const destination = buildFrontendRedirect("/settings/payments", {
      linked: 1,
      companyId,
    });
    return redirect(302, destination);
  } catch (error) {
    await db.collection("oauthStates").doc(state).delete().catch(() => null);
    const destination = buildFrontendRedirect("/settings/payments", {
      linked: 0,
      reason: "token_exchange_failed",
    });
    return redirect(302, destination);
  }
};
