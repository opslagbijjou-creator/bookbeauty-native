const MOLLIE_API_BASE = "https://api.mollie.com/v2";

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

function resolveApiKey() {
  return (
    String(process.env.MOLLIE_API_KEY_TEST || "").trim() ||
    String(process.env.MOLLIE_API_KEY || "").trim() ||
    ""
  );
}

function resolveSiteUrl(event) {
  const fromEnv =
    String(process.env.APP_URL || "").trim() ||
    String(process.env.URL || "").trim() ||
    String(process.env.DEPLOY_PRIME_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const headers = event.headers || {};
  const host = String(headers["x-forwarded-host"] || headers.host || "").trim();
  const proto = String(headers["x-forwarded-proto"] || "https").trim();
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return "";
}

function parseBody(event) {
  try {
    const raw = typeof event.body === "string" ? event.body : "{}";
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function normalizeAmount(value) {
  const numeric = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("amountValue moet groter zijn dan 0.");
  }
  return numeric.toFixed(2);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" });
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    return response(500, {
      ok: false,
      error: "MOLLIE_API_KEY_TEST (of MOLLIE_API_KEY) ontbreekt in Netlify env vars.",
    });
  }

  const body = parseBody(event);
  const siteUrl = resolveSiteUrl(event);

  try {
    const amountValue = normalizeAmount(body.amountValue);
    const description = String(body.description || "BookBeauty betaling").trim() || "BookBeauty betaling";
    const redirectUrl = String(body.redirectUrl || `${siteUrl}/`).trim();
    const webhookUrl =
      String(body.webhookUrl || `${siteUrl}/.netlify/functions/mollie-webhook`).trim();

    if (!redirectUrl || !redirectUrl.startsWith("http")) {
      throw new Error("redirectUrl ontbreekt of is ongeldig.");
    }
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      throw new Error("webhookUrl ontbreekt of is ongeldig.");
    }

    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? { ...body.metadata }
        : {};
    if (!metadata.bookingId && typeof body.bookingId === "string" && body.bookingId.trim()) {
      metadata.bookingId = body.bookingId.trim();
    }

    const payload = {
      amount: { currency: "EUR", value: amountValue },
      description,
      redirectUrl,
      webhookUrl,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };

    const mollieRes = await fetch(`${MOLLIE_API_BASE}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!mollieRes.ok) {
      const text = await mollieRes.text();
      return response(502, {
        ok: false,
        error: "Payment aanmaken bij Mollie mislukt.",
        details: text.slice(0, 800),
      });
    }

    const payment = await mollieRes.json();
    return response(200, {
      ok: true,
      paymentId: payment?.id || "",
      status: payment?.status || "",
      checkoutUrl: payment?._links?.checkout?.href || "",
      webhookUrl,
    });
  } catch (error) {
    return response(400, {
      ok: false,
      error: error instanceof Error ? error.message : "Ongeldige aanvraag",
    });
  }
};
