const { getFirestore } = require("./_firebaseAdmin");

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Cache-Control": "public, max-age=60",
    },
    body: JSON.stringify(payload),
  };
}

function hasEnv(name) {
  return Boolean(String(process.env[name] || "").trim());
}

function envSummary() {
  return {
    // Core
    APP_BASE_URL: hasEnv("APP_BASE_URL"),
    MOLLIE_WEBHOOK_URL: hasEnv("MOLLIE_WEBHOOK_URL"),
    MOLLIE_MODE: hasEnv("MOLLIE_MODE"),
    MOLLIE_API_KEY_PLATFORM: hasEnv("MOLLIE_API_KEY_PLATFORM"),

    // OAuth (Marketplace)
    MOLLIE_OAUTH_CLIENT_ID: hasEnv("MOLLIE_OAUTH_CLIENT_ID"),
    MOLLIE_OAUTH_CLIENT_SECRET: hasEnv("MOLLIE_OAUTH_CLIENT_SECRET"),
    MOLLIE_OAUTH_REDIRECT_URI: hasEnv("MOLLIE_OAUTH_REDIRECT_URI"),
  };
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "").toUpperCase();
  console.log("[payments-health] request", { method });

  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (method !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const env = envSummary();

  const mollieSdkInstalled = (() => {
    try {
      return Boolean(require("@mollie/api-client"));
    } catch {
      return false;
    }
  })();

  let firebaseAdminInitOk = false;
  let firebaseAdminError = "";
  try {
    getFirestore();
    firebaseAdminInitOk = true;
  } catch (error) {
    firebaseAdminError = error instanceof Error ? error.message : "unknown_error";
  }

  // Platform core (platform API key flow)
  const platformCore =
    env.APP_BASE_URL &&
    env.MOLLIE_WEBHOOK_URL &&
    env.MOLLIE_MODE &&
    env.MOLLIE_API_KEY_PLATFORM;

  // OAuth core (marketplace connect flow)
  const oauthCore =
    env.MOLLIE_OAUTH_CLIENT_ID &&
    env.MOLLIE_OAUTH_CLIENT_SECRET &&
    env.MOLLIE_OAUTH_REDIRECT_URI;

  const missingPlatformEnv = Object.entries({
    APP_BASE_URL: env.APP_BASE_URL,
    MOLLIE_WEBHOOK_URL: env.MOLLIE_WEBHOOK_URL,
    MOLLIE_MODE: env.MOLLIE_MODE,
    MOLLIE_API_KEY_PLATFORM: env.MOLLIE_API_KEY_PLATFORM,
  })
    .filter(([, present]) => !present)
    .map(([name]) => name);

  const missingOauthEnv = Object.entries({
    MOLLIE_OAUTH_CLIENT_ID: env.MOLLIE_OAUTH_CLIENT_ID,
    MOLLIE_OAUTH_CLIENT_SECRET: env.MOLLIE_OAUTH_CLIENT_SECRET,
    MOLLIE_OAUTH_REDIRECT_URI: env.MOLLIE_OAUTH_REDIRECT_URI,
  })
    .filter(([, present]) => !present)
    .map(([name]) => name);

  return response(200, {
    ok: true,
    envVarsPresent: env,
    platformCore,
    oauthCore,
    missingPlatformEnv,
    missingOauthEnv,
    mollieSdkInstalled,
    firebaseAdminInitOk,
    firebaseAdminError,
  });
};
