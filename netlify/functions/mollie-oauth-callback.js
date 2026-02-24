const { createMollieClient } = require("@mollie/api-client");
const { getFirestore, admin } = require("./_firebaseAdmin");
const {
  exchangeAuthorizationCode,
  getAppBaseUrl,
  isTestMode,
  redirect,
  response,
  saveCompanyMollieTokens,
} = require("./_mollieConnect");

function buildRedirectUrl(baseUrl, params) {
  const url = new URL(`${baseUrl}/payments`);
  Object.entries(params).forEach(([key, value]) => {
    const clean = String(value || "").trim();
    if (clean) url.searchParams.set(key, clean);
  });
  return url.toString();
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  console.log("[mollie-oauth-callback] request", { method });

  if (method === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const appBaseUrl = (() => {
    try {
      return getAppBaseUrl();
    } catch {
      return "https://www.bookbeauty.nl";
    }
  })();

  const query = event.queryStringParameters || {};
  const code = String(query.code || "").trim();
  const state = String(query.state || "").trim();
  const oauthError = String(query.error || "").trim();
  const oauthErrorDescription = String(query.error_description || "").trim();

  if (oauthError) {
    console.warn("[mollie-oauth-callback] provider returned error", {
      error: oauthError,
      hasState: Boolean(state),
    });
    const location = buildRedirectUrl(appBaseUrl, {
      mollie: "error",
      reason: oauthError,
      details: oauthErrorDescription.slice(0, 120),
    });
    return redirect(302, location);
  }

  if (!code || !state) {
    const location = buildRedirectUrl(appBaseUrl, {
      mollie: "error",
      reason: "missing_code_or_state",
    });
    return redirect(302, location);
  }

  const db = getFirestore();
  const stateRef = db.collection("oauthStates").doc(state);

  try {
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      const location = buildRedirectUrl(appBaseUrl, {
        mollie: "error",
        reason: "invalid_state",
      });
      return redirect(302, location);
    }

    const stateDoc = stateSnap.data() || {};
    const provider = String(stateDoc.provider || "").trim();
    const companyId = String(stateDoc.companyId || "").trim();
    const actorUid = String(stateDoc.actorUid || "").trim();
    const expiresAtMs = Number(stateDoc.expiresAtMs || 0);
    const consumed = Boolean(stateDoc.consumed);

    if (!companyId || (provider !== "mollie" && provider !== "mollie-client-link")) {
      await stateRef.set(
        {
          consumed: true,
          consumedAt: admin.firestore.FieldValue.serverTimestamp(),
          consumeReason: "invalid_state_payload",
        },
        { merge: true }
      );
      const location = buildRedirectUrl(appBaseUrl, {
        mollie: "error",
        reason: "invalid_state_payload",
      });
      return redirect(302, location);
    }

    if (consumed) {
      const location = buildRedirectUrl(appBaseUrl, {
        mollie: "connected",
        companyId,
      });
      return redirect(302, location);
    }

    if (!expiresAtMs || expiresAtMs < Date.now()) {
      await stateRef.set(
        {
          consumed: true,
          consumedAt: admin.firestore.FieldValue.serverTimestamp(),
          consumeReason: "expired",
        },
        { merge: true }
      );
      const location = buildRedirectUrl(appBaseUrl, {
        mollie: "error",
        reason: "expired_state",
        companyId,
      });
      return redirect(302, location);
    }

    console.log("[mollie-oauth-callback] exchanging code", {
      companyId,
      actorUid,
      provider,
    });
    const tokenPayload = await exchangeAuthorizationCode(code);
    const accessToken = String(tokenPayload?.access_token || "").trim();
    if (!accessToken) {
      throw new Error("Token exchange returned empty access token");
    }

    const connectedClient = createMollieClient({ accessToken });
    const [organizationResult, onboardingResult, profilesResult] = await Promise.allSettled([
      connectedClient.organizations.get("me"),
      connectedClient.onboarding.get({ testmode: isTestMode() }),
      connectedClient.profiles.page({ limit: 1 }),
    ]);

    const organization =
      organizationResult.status === "fulfilled" && organizationResult.value
        ? organizationResult.value
        : null;
    const onboarding =
      onboardingResult.status === "fulfilled" && onboardingResult.value
        ? onboardingResult.value
        : null;
    const profileId = (() => {
      if (profilesResult.status !== "fulfilled") return "";
      const page = profilesResult.value;
      if (Array.isArray(page) && page.length) {
        return String(page[0]?.id || "").trim();
      }
      if (Array.isArray(page?.data) && page.data.length) {
        return String(page.data[0]?.id || "").trim();
      }
      if (Array.isArray(page?._embedded?.profiles) && page._embedded.profiles.length) {
        return String(page._embedded.profiles[0]?.id || "").trim();
      }
      return "";
    })();

    await saveCompanyMollieTokens(db, companyId, tokenPayload, {
      mollie: {
        model: "platform",
        organizationId: String(organization?.id || "").trim(),
        organizationName: String(organization?.name || "").trim(),
        profileId,
        onboardingStatus: String(onboarding?.status || "").trim(),
        canReceivePayments: Boolean(onboarding?.canReceivePayments),
        canReceiveSettlements: Boolean(onboarding?.canReceiveSettlements),
        dashboardOnboardingUrl: String(onboarding?._links?.dashboard?.href || "").trim(),
        linkedByUid: actorUid || admin.firestore.FieldValue.delete(),
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    await stateRef.set(
      {
        consumed: true,
        consumedAt: admin.firestore.FieldValue.serverTimestamp(),
        consumeReason: "success",
      },
      { merge: true }
    );

    const location = buildRedirectUrl(appBaseUrl, {
      mollie: "connected",
      companyId,
    });
    return redirect(302, location);
  } catch (error) {
    console.error("[mollie-oauth-callback] failed", {
      hasState: Boolean(state),
      message: error instanceof Error ? error.message : "unknown_error",
    });
    await stateRef
      .set(
        {
          consumed: true,
          consumedAt: admin.firestore.FieldValue.serverTimestamp(),
          consumeReason: "error",
        },
        { merge: true }
      )
      .catch(() => null);

    const location = buildRedirectUrl(appBaseUrl, {
      mollie: "error",
      reason: "callback_failed",
      details: (error instanceof Error ? error.message : "unknown_error").slice(0, 120),
    });
    return redirect(302, location);
  }
};
