const admin = require("firebase-admin");

function normalizeServiceAccount(input) {
  const node = input && typeof input === "object" ? { ...input } : {};
  const privateKey = String(node.private_key || node.privateKey || "").trim();
  if (privateKey) {
    // Netlify env values are often pasted with escaped newlines.
    node.private_key = privateKey.replace(/\\n/g, "\n");
  }
  return node;
}

function parseJsonWithFallback(rawValue, envName) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const attempts = [raw];
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    attempts.push(raw.slice(1, -1));
  }

  for (const candidate of attempts) {
    try {
      return normalizeServiceAccount(JSON.parse(candidate));
    } catch {
      // Try next variant.
    }
  }

  throw new Error(`${envName} bevat geen geldige JSON.`);
}

function resolveServiceAccount() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) {
    return parseJsonWithFallback(rawJson, "FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  const base64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!base64) {
    throw new Error(
      "Firebase credentials ontbreken. Zet FIREBASE_SERVICE_ACCOUNT_BASE64 of FIREBASE_SERVICE_ACCOUNT_JSON in Netlify."
    );
  }

  try {
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    return parseJsonWithFallback(decoded, "FIREBASE_SERVICE_ACCOUNT_BASE64");
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is ongeldig.");
  }
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = resolveServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin.app();
}

function getFirestore() {
  const app = getAdminApp();
  return app.firestore();
}

module.exports = {
  admin,
  getFirestore,
};
