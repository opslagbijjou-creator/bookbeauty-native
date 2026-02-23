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
  const options = {
    body,
    icon: String(payload.icon || "/icon-192.png"),
    badge: String(payload.badge || "/icon-192.png"),
    data,
    tag: data.notificationId ? `bb-${String(data.notificationId)}` : undefined,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

function resolveTargetUrl(data) {
  const role = String(data.role || "").trim();
  const bookingId = String(data.bookingId || "").trim();
  if (role === "company") {
    return bookingId ? `/(company)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}` : "/(company)/notifications";
  }
  if (role === "customer") {
    return bookingId
      ? `/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(bookingId)}`
      : "/(customer)/notifications";
  }
  return "/";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification && event.notification.data ? event.notification.data : {};
  const targetUrl = resolveTargetUrl(data);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client && typeof client.focus === "function") {
            client.postMessage({ type: "bookbeauty-notification-click", data });
            if (typeof client.navigate === "function") {
              return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
      .catch(() => self.clients.openWindow(targetUrl))
  );
});
