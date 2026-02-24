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
    APP_BASE_URL: hasEnv("APP_BASE_URL"),
    MOLLIE_WEBHOOK_URL: hasEnv("MOLLIE_WEBHOOK_URL"),
    MOLLIE_MODE: hasEnv("MOLLIE_MODE"),
    MOLLIE_OAUTH_CLIENT_ID: hasEnv("MOLLIE_OAUTH_CLIENT_ID"),
    MOLLIE_OAUTH_CLIENT_SECRET: hasEnv("MOLLIE_OAUTH_CLIENT_SECRET"),
    MOLLIE_OAUTH_REDIRECT_URI: hasEnv("MOLLIE_OAUTH_REDIRECT_URI"),
    MOLLIE_API_KEY_PLATFORM: hasEnv("MOLLIE_API_KEY_PLATFORM"),
    FIREBASE_SERVICE_ACCOUNT_JSON: hasEnv("FIREBASE_SERVICE_ACCOUNT_JSON"),
    FIREBASE_SERVICE_ACCOUNT_BASE64: hasEnv("FIREBASE_SERVICE_ACCOUNT_BASE64"),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const env = envSummary();
  const firebaseEnvPresent = env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_BASE64;

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

  const oauthEnvOk =
    env.APP_BASE_URL &&
    env.MOLLIE_WEBHOOK_URL &&
    env.MOLLIE_MODE &&
    env.MOLLIE_OAUTH_CLIENT_ID &&
    env.MOLLIE_OAUTH_CLIENT_SECRET &&
    env.MOLLIE_OAUTH_REDIRECT_URI;

  return response(200, {
    ok: true,
    envVarsPresent: {
      ...env,
      firebaseAny: firebaseEnvPresent,
      oauthCore: oauthEnvOk,
    },
    mollieSdkInstalled,
    firebaseAdminInitOk,
    firebaseAdminError,
  });
};
