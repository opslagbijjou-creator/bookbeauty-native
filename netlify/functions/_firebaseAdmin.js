const admin = require("firebase-admin");

function resolveServiceAccount() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON bevat geen geldige JSON.");
    }
  }

  const base64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!base64) {
    throw new Error(
      "Firebase credentials ontbreken. Zet FIREBASE_SERVICE_ACCOUNT_BASE64 of FIREBASE_SERVICE_ACCOUNT_JSON in Netlify."
    );
  }

  try {
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(decoded);
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

