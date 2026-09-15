// public/sw-push.js
//
// "Add push notifications (mobile and desktop)." Deliberately minimal — this
// service worker does exactly two things (receive a push, handle a tap on
// it) and nothing else. No fetch interception, no offline caching: that's a
// separate, much bigger feature nobody asked for, and a caching SW that
// gets it wrong is a classic way to make an app serve stale content forever.
// Registered from src/push/registerPush.ts, real mode only.

self.addEventListener("push", (event) => {
  let data = { title: "Chappter", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // A malformed/empty payload still shows a generic notification rather
    // than silently doing nothing — a push the browser woke the SW for
    // deserves SOME visible result.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Focuses an already-open tab on this origin instead of always opening a new
// one — a phone with the app already open shouldn't accumulate duplicate tabs
// every time a notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
