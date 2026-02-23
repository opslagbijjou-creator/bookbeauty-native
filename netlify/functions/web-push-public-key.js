function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const publicKey = String(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || ""
  ).trim();
  const privateKeyConfigured = Boolean(String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim());

  if (!publicKey) {
    return response(200, {
      ok: false,
      reason: "missing_public_key",
      publicKey: "",
      serverCanSend: false,
      privateKeyConfigured,
    });
  }

  return response(200, {
    ok: true,
    publicKey,
    serverCanSend: privateKeyConfigured,
    privateKeyConfigured,
  });
};
