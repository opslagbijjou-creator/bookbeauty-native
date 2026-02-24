const { getFirestore, admin } = require("./_firebaseAdmin");

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const webPushModuleInstalled = (() => {
    try {
      return Boolean(require("web-push"));
    } catch {
      return false;
    }
  })();

  const publicKeyConfigured =
    hasEnv("WEB_PUSH_VAPID_PUBLIC_KEY") || hasEnv("EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKeyConfigured = hasEnv("WEB_PUSH_VAPID_PRIVATE_KEY");
  const firebaseServiceAccountConfigured =
    hasEnv("FIREBASE_SERVICE_ACCOUNT_BASE64") || hasEnv("FIREBASE_SERVICE_ACCOUNT_JSON");

  let firebaseAdminInitOk = false;
  let firebaseAdminAuthOk = false;
  let firebaseAdminError = "";
  try {
    getFirestore();
    firebaseAdminInitOk = true;
    // Triggers auth client initialization without exposing secrets.
    const app = admin.app();
    firebaseAdminAuthOk = Boolean(app && admin.auth());
  } catch (error) {
    firebaseAdminError = error instanceof Error ? error.message : "unknown_error";
  }

  const readyForWebPush =
    webPushModuleInstalled &&
    publicKeyConfigured &&
    privateKeyConfigured &&
    firebaseServiceAccountConfigured &&
    firebaseAdminInitOk &&
    firebaseAdminAuthOk;

  return response(200, {
    ok: true,
    readyForWebPush,
    webPushModuleInstalled,
    publicKeyConfigured,
    privateKeyConfigured,
    firebaseServiceAccountConfigured,
    firebaseAdminInitOk,
    firebaseAdminAuthOk,
    firebaseAdminError,
  });
};
