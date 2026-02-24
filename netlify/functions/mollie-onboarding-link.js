const { createMollieClient } = require("@mollie/api-client");
const { getFirestore } = require("./_firebaseAdmin");
const {
  buildOauthAuthorizeUrl,
  canManageCompany,
  generateStateId,
  getConnectedMollieClient,
  isTestMode,
  parseBody,
  requireAuthUid,
  response,
} = require("./_mollieConnect");

/**
 * Preferred path:
 * - Company already linked via OAuth -> return Mollie dashboard onboarding link.
 *
 * Optional fallback:
 * - createClientLink=true and platform API key is configured -> create client-link for invitation flow.
 *   This is useful if you want to onboard a merchant from platform-side without first sending them
 *   through the regular OAuth authorization URL.
 */
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
  const companyId = String(body.companyId || "").trim();
  const createClientLink = Boolean(body.createClientLink);
  if (!companyId) {
    return response(400, { ok: false, error: "companyId is verplicht." });
  }

  const db = getFirestore();
  const canManage = await canManageCompany(db, companyId, actorUid).catch(() => false);
  if (!canManage) {
    return response(403, { ok: false, error: "Geen toegang voor dit bedrijf." });
  }

  try {
    const connected = await getConnectedMollieClient(db, companyId);
    const onboarding = await connected.client.onboarding.get({ testmode: isTestMode() });
    const dashboardUrl = String(onboarding?._links?.dashboard?.href || "").trim();

    await db
      .collection("companies")
      .doc(companyId)
      .set(
        {
          mollie: {
            onboardingStatus: String(onboarding?.status || "").trim(),
            canReceivePayments: Boolean(onboarding?.canReceivePayments),
            canReceiveSettlements: Boolean(onboarding?.canReceiveSettlements),
            dashboardOnboardingUrl: dashboardUrl,
            onboardingRefreshedAt: new Date(),
            updatedAt: new Date(),
          },
          updatedAt: new Date(),
        },
        { merge: true }
      );

    return response(200, {
      ok: true,
      mode: "oauth_onboarding",
      onboardingStatus: onboarding?.status || "",
      canReceivePayments: Boolean(onboarding?.canReceivePayments),
      canReceiveSettlements: Boolean(onboarding?.canReceiveSettlements),
      onboardingUrl: dashboardUrl,
    });
  } catch (error) {
    if (!createClientLink) {
      return response(409, {
        ok: false,
        error: "Mollie account niet gekoppeld. Start eerst mollie-oauth-start.",
      });
    }
  }

  const platformApiKey = String(process.env.MOLLIE_API_KEY_PLATFORM || "").trim();
  if (!platformApiKey) {
    return response(500, {
      ok: false,
      error: "MOLLIE_API_KEY_PLATFORM ontbreekt voor client-link onboarding.",
    });
  }

  const ownerEmail = String(body.ownerEmail || "").trim();
  const ownerGivenName = String(body.ownerGivenName || "").trim();
  const ownerFamilyName = String(body.ownerFamilyName || "").trim();
  const businessName = String(body.businessName || "").trim();
  const country = String(body.country || "NL").trim().toUpperCase();

  if (!ownerEmail || !ownerGivenName || !ownerFamilyName || !businessName || !country) {
    return response(400, {
      ok: false,
      error:
        "Voor client-link onboarding zijn ownerEmail, ownerGivenName, ownerFamilyName, businessName en country verplicht.",
    });
  }

  try {
    const state = generateStateId();
    const expiresAtMs = Date.now() + 15 * 60 * 1000;
    await db.collection("oauthStates").doc(state).set({
      state,
      provider: "mollie-client-link",
      companyId,
      actorUid,
      createdAt: new Date(),
      expiresAt: new Date(expiresAtMs),
      expiresAtMs,
      consumed: false,
    });

    const platformClient = createMollieClient({ apiKey: platformApiKey });
    const clientLink = await platformClient.clientLinks.create({
      owner: {
        email: ownerEmail,
        givenName: ownerGivenName,
        familyName: ownerFamilyName,
      },
      name: businessName,
      address: {
        country,
      },
    });

    const baseClientLink = String(clientLink?._links?.clientLink?.href || "").trim();
    if (!baseClientLink) {
      throw new Error("Geen client link URL ontvangen van Mollie.");
    }

    // Per Mollie docs moeten client_id/state/scope als query op deze URL.
    const oauthUrl = new URL(baseClientLink);
    const fallbackAuthorize = new URL(buildOauthAuthorizeUrl({ state }));
    const scopes = fallbackAuthorize.searchParams.get("scope") || "";
    oauthUrl.searchParams.set("client_id", fallbackAuthorize.searchParams.get("client_id") || "");
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("scope", scopes);

    await db
      .collection("companies")
      .doc(companyId)
      .set(
        {
          mollie: {
            status: "onboarding",
            clientLinkUrl: oauthUrl.toString(),
            clientLinkCreatedAt: new Date(),
            updatedAt: new Date(),
          },
          updatedAt: new Date(),
        },
        { merge: true }
      );

    return response(200, {
      ok: true,
      mode: "client_link",
      onboardingUrl: oauthUrl.toString(),
    });
  } catch (error) {
    return response(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Kon onboarding link niet aanmaken.",
    });
  }
};
