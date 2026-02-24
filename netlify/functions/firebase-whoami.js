const { getAdminApp } = require("./_firebaseAdmin");

exports.handler = async () => {
  try {
    const app = getAdminApp();
    const projectId =
      app?.options?.projectId ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIREBASE_PROJECT_ID ||
      "";

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        projectId,
        databaseURL: app?.options?.databaseURL || "",
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
