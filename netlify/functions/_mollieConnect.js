const crypto = require("crypto");
const { createMollieClient } = require("@mollie/api-client");
const { admin, getAdminApp } = require("./_firebaseAdmin");

const MOLLIE_OAUTH_TOKEN_URL = "https://api.mollie.com/oauth2/tokens";
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const TOKEN_ENCRYPTION_VERSION = "v1";
const TOKEN_ENCRYPTION_ALGO = "aes-256-gcm";
const TOKEN_ENCRYPTION_IV_BYTES = 12;

function getEnv(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function response(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

function redirect(statusCode, location) {
  return {
    statusCode,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
    body: "",
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

function readInputField(event, field) {
  const body = parseBody(event);
  if (Object.prototype.hasOwnProperty.call(body, field)) {
    return body[field];
  }
  return event.queryStringParameters?.[field];
}

function buildOauthScopes() {
  const fromEnv = getEnv("MOLLIE_OAUTH_SCOPES");
  if (fromEnv) return fromEnv;
  return [
    "payments.read",
    "payments.write",
    "refunds.read",
    "refunds.write",
    "organizations.read",
    "profiles.read",
    "onboarding.read",
    "onboarding.write",
  ].join(" ");
}

function isTestMode() {
  return getEnv("MOLLIE_MODE", "test").toLowerCase() !== "live";
}

function toAmountValueFromCents(cents) {
  const safe = Math.max(0, Math.floor(Number(cents) || 0));
  return (safe / 100).toFixed(2);
}

function amountToCents(value) {
  const numeric = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100));
}

function normalizePercent(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Number(numeric.toFixed(2))));
}

function generateStateId() {
  return crypto.randomBytes(24).toString("base64url");
}

function parseAuthBearer(event) {
  const authHeader =
    String(event.headers?.authorization || "").trim() ||
    String(event.headers?.Authorization || "").trim();
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function requireAuthUid(event) {
  const token = parseAuthBearer(event);
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }
  // Ensure firebase-admin is initialized before auth verification.
  getAdminApp();
  const decoded = await admin.auth().verifyIdToken(token);
  const uid = String(decoded?.uid || "").trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

async function getUserRole(db, uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return "";
  return String(snap.data()?.role || "").trim().toLowerCase();
}

async function canManageCompany(db, companyId, actorUid) {
  if (!companyId || !actorUid) return false;
  if (companyId === actorUid) return true;

  const role = await getUserRole(db, actorUid).catch(() => "");
  if (role === "admin") return true;

  const companySnap = await db.collection("companies").doc(companyId).get();
  if (!companySnap.exists) return false;
  const company = companySnap.data() || {};
  if (String(company.ownerId || "").trim() === actorUid) return true;

  const staffSnap = await db.collection("companies").doc(companyId).collection("staff").doc(actorUid).get();
  if (!staffSnap.exists) return false;
  return Boolean(staffSnap.data()?.isOwner);
}

function getOAuthCredentials() {
  return {
    clientId: requireEnv("MOLLIE_OAUTH_CLIENT_ID"),
    clientSecret: requireEnv("MOLLIE_OAUTH_CLIENT_SECRET"),
    redirectUri: requireEnv("MOLLIE_OAUTH_REDIRECT_URI"),
  };
}

function getAppBaseUrl() {
  return requireEnv("APP_BASE_URL").replace(/\/+$/, "");
}

function getWebhookUrl() {
  return requireEnv("MOLLIE_WEBHOOK_URL");
}

function buildOauthAuthorizeUrl({ state }) {
  const { clientId, redirectUri } = getOAuthCredentials();
  const scope = buildOauthScopes();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope,
  });
  return `https://my.mollie.com/oauth2/authorize?${params.toString()}`;
}

function createBasicAuthHeader(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function exchangeAuthorizationCode(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(MOLLIE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: createBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload.toString(),
  });

  if (!tokenRes.ok) {
    const details = await tokenRes.text().catch(() => "");
    throw new Error(`OAuth token exchange failed (${tokenRes.status}) ${details.slice(0, 280)}`);
  }

  return tokenRes.json();
}

async function refreshAccessToken(refreshToken) {
  const cleanRefreshToken = String(refreshToken || "").trim();
  if (!cleanRefreshToken) {
    throw new Error("Missing refresh token");
  }

  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();
  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cleanRefreshToken,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(MOLLIE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: createBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload.toString(),
  });

  if (!tokenRes.ok) {
    const details = await tokenRes.text().catch(() => "");
    throw new Error(`OAuth token refresh failed (${tokenRes.status}) ${details.slice(0, 280)}`);
  }

  return tokenRes.json();
}

function resolveTokenEncryptionKey() {
  const raw = getEnv("MOLLIE_TOKEN_ENCRYPTION_KEY");
  if (!raw) return null;

  const asBase64 = (() => {
    try {
      const node = Buffer.from(raw, "base64");
      return node.length === 32 ? node : null;
    } catch {
      return null;
    }
  })();
  if (asBase64) return asBase64;

  const asHex = (() => {
    try {
      const node = Buffer.from(raw, "hex");
      return node.length === 32 ? node : null;
    } catch {
      return null;
    }
  })();
  if (asHex) return asHex;

  const asUtf8 = Buffer.from(raw, "utf8");
  if (asUtf8.length === 32) return asUtf8;
  return null;
}

function encodeTokenForStorage(tokenValue) {
  const clean = String(tokenValue || "").trim();
  if (!clean) return { value: "", mode: "empty" };

  const key = resolveTokenEncryptionKey();
  if (!key) {
    return {
      value: `b64:${Buffer.from(clean, "utf8").toString("base64")}`,
      mode: "base64",
    };
  }

  const iv = crypto.randomBytes(TOKEN_ENCRYPTION_IV_BYTES);
  const cipher = crypto.createCipheriv(TOKEN_ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    value: `${TOKEN_ENCRYPTION_VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString(
      "base64url"
    )}`,
    mode: "encrypted",
  };
}

function decodeTokenFromStorage(rawToken) {
  const raw = String(rawToken || "").trim();
  if (!raw) return "";

  if (raw.startsWith("b64:")) {
    try {
      return Buffer.from(raw.slice(4), "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  if (raw.startsWith(`${TOKEN_ENCRYPTION_VERSION}:`)) {
    const key = resolveTokenEncryptionKey();
    if (!key) return "";

    const parts = raw.split(":");
    if (parts.length !== 4) return "";
    try {
      const iv = Buffer.from(parts[1], "base64url");
      const tag = Buffer.from(parts[2], "base64url");
      const encrypted = Buffer.from(parts[3], "base64url");
      const decipher = crypto.createDecipheriv(TOKEN_ENCRYPTION_ALGO, key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      return "";
    }
  }

  return raw;
}

function toMollieConfig(companyDocData) {
  const raw = companyDocData?.mollie && typeof companyDocData.mollie === "object" ? companyDocData.mollie : {};
  const scopeRaw = String(raw.scope || "");
  const accessToken = decodeTokenFromStorage(raw.accessTokenEncrypted || raw.accessToken);
  const refreshToken = decodeTokenFromStorage(raw.refreshTokenEncrypted || raw.refreshToken);

  return {
    linked: Boolean(raw.linked) || String(raw.status || "").trim().toLowerCase() === "linked",
    status: String(raw.status || "").trim().toLowerCase(),
    model: String(raw.model || "platform").trim(),
    organizationId: String(raw.organizationId || "").trim(),
    organizationName: String(raw.organizationName || "").trim(),
    profileId: String(raw.profileId || "").trim(),
    accessToken,
    refreshToken,
    tokenType: String(raw.tokenType || "").trim(),
    scope: scopeRaw,
    scopeList: scopeRaw
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean),
    tokenExpiresAtMs: Number(raw.tokenExpiresAtMs || 0),
    onboardingStatus: String(raw.onboardingStatus || "").trim().toLowerCase(),
    canReceivePayments: Boolean(raw.canReceivePayments),
    canReceiveSettlements: Boolean(raw.canReceiveSettlements),
  };
}

async function saveCompanyMollieTokens(db, companyId, tokenPayload, extraPatch = {}) {
  const expiresInSec = Number(tokenPayload?.expires_in || 0);
  const tokenExpiresAtMs = expiresInSec > 0 ? Date.now() + expiresInSec * 1000 : 0;

  const encodedAccess = encodeTokenForStorage(String(tokenPayload?.access_token || "").trim());
  const encodedRefresh = encodeTokenForStorage(String(tokenPayload?.refresh_token || "").trim());

  const nextPatch = {
    ...extraPatch,
    mollie: {
      model: "platform",
      linked: true,
      status: "linked",
      ...(extraPatch.mollie || {}),
      accessTokenEncrypted: encodedAccess.value || admin.firestore.FieldValue.delete(),
      refreshTokenEncrypted: encodedRefresh.value || admin.firestore.FieldValue.delete(),
      accessTokenStorageMode: encodedAccess.mode,
      refreshTokenStorageMode: encodedRefresh.mode,
      // Remove legacy plain token fields once encrypted/base64 fields are stored.
      accessToken: admin.firestore.FieldValue.delete(),
      refreshToken: admin.firestore.FieldValue.delete(),
      tokenType: String(tokenPayload?.token_type || "bearer").trim(),
      scope: String(tokenPayload?.scope || "").trim(),
      tokenExpiresAtMs,
      tokenExpiresAt:
        tokenExpiresAtMs > 0 ? new Date(tokenExpiresAtMs) : admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("companies").doc(companyId).set(nextPatch, { merge: true });
  return tokenExpiresAtMs;
}

function isMollieAuthError(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  if (status === 401 || status === 403) return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unauthorized") || message.includes("invalid_token");
}

async function getConnectedMollieClient(db, companyId) {
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new Error("Company not found");
  }

  const company = companySnap.data() || {};
  const mollie = toMollieConfig(company);
  if (!mollie.linked || !mollie.accessToken) {
    throw new Error("Company Mollie account is not linked");
  }

  let accessToken = mollie.accessToken;
  let refreshTokenValue = mollie.refreshToken;
  let tokenExpiresAtMs = mollie.tokenExpiresAtMs;

  const needsRefresh = Boolean(
    refreshTokenValue &&
      tokenExpiresAtMs > 0 &&
      tokenExpiresAtMs <= Date.now() + TOKEN_REFRESH_SKEW_MS
  );

  if (needsRefresh) {
    const refreshed = await refreshAccessToken(refreshTokenValue);
    tokenExpiresAtMs = await saveCompanyMollieTokens(db, companyId, refreshed, {
      mollie: {
        model: mollie.model || "platform",
        organizationId: mollie.organizationId || "",
        organizationName: mollie.organizationName || "",
        profileId: mollie.profileId || "",
      },
    });
    accessToken = String(refreshed.access_token || "").trim();
    refreshTokenValue = String(refreshed.refresh_token || "").trim() || refreshTokenValue;
  }

  if (!accessToken) {
    throw new Error("Company Mollie access token missing");
  }

  const client = createMollieClient({ accessToken });
  return {
    client,
    company,
    companyRef,
    mollie: {
      ...mollie,
      accessToken,
      refreshToken: refreshTokenValue,
      tokenExpiresAtMs,
    },
  };
}

async function withAutoRefresh(db, companyId, mollieConfig, runner) {
  const runWithToken = async (token) => {
    const client = createMollieClient({ accessToken: token });
    return runner(client);
  };

  try {
    return await runWithToken(mollieConfig.accessToken);
  } catch (error) {
    if (!isMollieAuthError(error) || !mollieConfig.refreshToken) {
      throw error;
    }

    const refreshed = await refreshAccessToken(mollieConfig.refreshToken);
    await saveCompanyMollieTokens(db, companyId, refreshed, {
      mollie: {
        model: mollieConfig.model || "platform",
        organizationId: mollieConfig.organizationId || "",
        organizationName: mollieConfig.organizationName || "",
        profileId: mollieConfig.profileId || "",
      },
    });
    const nextAccessToken = String(refreshed.access_token || "").trim();
    if (!nextAccessToken) {
      throw new Error("Token refresh succeeded without access token");
    }
    return runWithToken(nextAccessToken);
  }
}

function parseWebhookPaymentId(event) {
  const bodyRaw = typeof event.body === "string" ? event.body : "";
  const contentType = String(event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyRaw || "{}");
      return String(parsed?.id || "").trim();
    } catch {
      return "";
    }
  }

  const form = new URLSearchParams(bodyRaw);
  const fromBody = String(form.get("id") || "").trim();
  if (fromBody) return fromBody;
  return String(event.queryStringParameters?.id || "").trim();
}

function extractBookingIdFromPayment(payment) {
  const metadata = payment?.metadata;
  if (metadata && typeof metadata === "object") {
    const direct = String(metadata.bookingId || "").trim();
    if (direct) return direct;
  }
  if (typeof metadata === "string") return metadata.trim();
  return "";
}

function extractCompanyIdFromPayment(payment) {
  const metadata = payment?.metadata;
  if (metadata && typeof metadata === "object") {
    const direct = String(metadata.companyId || "").trim();
    if (direct) return direct;
  }
  return "";
}

module.exports = {
  OAUTH_STATE_TTL_MS,
  amountToCents,
  buildOauthAuthorizeUrl,
  canManageCompany,
  exchangeAuthorizationCode,
  extractBookingIdFromPayment,
  extractCompanyIdFromPayment,
  generateStateId,
  getAppBaseUrl,
  getConnectedMollieClient,
  getEnv,
  getOAuthCredentials,
  getWebhookUrl,
  isTestMode,
  normalizePercent,
  parseBody,
  parseWebhookPaymentId,
  readInputField,
  redirect,
  refreshAccessToken,
  requireAuthUid,
  requireEnv,
  response,
  saveCompanyMollieTokens,
  toAmountValueFromCents,
  toMollieConfig,
  withAutoRefresh,
};
