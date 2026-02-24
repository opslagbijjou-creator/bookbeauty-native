const webpush = require("web-push");
const { getFirestore } = require("./_firebaseAdmin");

function pickSafeSubscriptionShape(sub) {
  if (!sub) return null;
  return {
    hasEndpoint: Boolean(sub.endpoint),
    hasKeys: Boolean(sub.keys),
    keysHasAuth: Boolean(sub.keys?.auth),
    keysHasP256dh: Boolean(sub.keys?.p256dh),
  };
}

exports.handler = async () => {
  try {
    const db = getFirestore();

    const snap = await db.collection("push_subscriptions").orderBy("createdAt", "desc").limit(5).get();
    if (snap.empty) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "no_subscriptions_found" }) };
    }

    // Pak het nieuwste doc dat een endpoint heeft
    let chosenDoc = null;
    let chosenSub = null;

    for (const d of snap.docs) {
      const data = d.data() || {};

      // mogelijke velden die jij zou kunnen hebben:
      const candidates = [
        data.subscription,
        data.sub,
        data.pushSubscription,
        data, // soms staat endpoint direct op root
      ];

      const found = candidates.find((c) => c && typeof c === "object" && c.endpoint);
      if (found) {
        chosenDoc = d;
        chosenSub = found;
        break;
      }
    }

    if (!chosenSub) {
      // geef info terug over de eerste doc structuur (zonder secrets)
      const d0 = snap.docs[0];
      const data0 = d0.data() || {};

      const shapes = {
        subscription: pickSafeSubscriptionShape(data0.subscription),
        sub: pickSafeSubscriptionShape(data0.sub),
        pushSubscription: pickSafeSubscriptionShape(data0.pushSubscription),
        root: pickSafeSubscriptionShape(data0),
        keysPresentAtRoot: Boolean(data0.keys),
        fields: Object.keys(data0).slice(0, 30),
      };

      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "no_valid_subscription_with_endpoint_found",
          sampleDocId: d0.id,
          shapes,
        }),
      };
    }

    webpush.setVapidDetails(
      "mailto:support@bookbeauty.nl",
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY
    );

    await webpush.sendNotification(
      chosenSub,
      JSON.stringify({
        title: "BookBeauty Test 🚀",
        body: "Push werkt! (endpoint gevonden)",
        url: "https://www.bookbeauty.nl",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        sent: true,
        usedDocId: chosenDoc.id,
        subscriptionShape: pickSafeSubscriptionShape(chosenSub),
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};