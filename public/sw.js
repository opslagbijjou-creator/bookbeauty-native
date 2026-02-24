self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = String(payload.title || "BookBeauty");
  const body = String(payload.body || "");
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: String(payload.icon || "/icon-192.png"),
      badge: String(payload.badge || "/icon-192.png"),
      data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification && event.notification.data ? event.notification.data : {};
  const targetUrl = String(data.url || "/");

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (!client || typeof client.focus !== "function") continue;
          client.postMessage({ type: "bookbeauty-notification-click", data });
          if (typeof client.navigate === "function") {
            return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
          }
          return client.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
      .catch(() => self.clients.openWindow(targetUrl))
  );
});
