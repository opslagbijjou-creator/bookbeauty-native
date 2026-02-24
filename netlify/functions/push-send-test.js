const webpush = require("web-push");
const { getFirestore } = require("./_firebaseAdmin");

exports.handler = async () => {
  try {
    const db = getFirestore();

    // Haal 1 subscription op
    const snap = await db.collection("push_subscriptions").limit(1).get();

    if (snap.empty) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "no_subscriptions_found" }),
      };
    }

    const subDoc = snap.docs[0];
    const subscription = subDoc.data().subscription;

    webpush.setVapidDetails(
      "mailto:support@bookbeauty.nl",
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY
    );

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "BookBeauty Test 🚀",
        body: "Push werkt!",
        url: "https://www.bookbeauty.nl",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, sent: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};