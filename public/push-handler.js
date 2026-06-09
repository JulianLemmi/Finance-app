// SW addon: maneja el evento push y los clicks en la notificación.
// Se carga vía workbox.importScripts desde vite.config.js, así que vive
// en el mismo SW que genera vite-plugin-pwa.

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try { payload = event.data.json(); }
    catch { payload = { title: "Finance App", body: event.data.text() }; }
  }
  const title = payload.title || "Finance App";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/pwa-icon-192.png",
    badge: payload.badge || "/pwa-icon-192.png",
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
    tag: payload.tag,
    renotify: !!payload.tag,
    requireInteraction: !!payload.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((c) => c.url.includes(self.location.origin));
    if (existing) {
      existing.focus();
      try { existing.navigate(targetUrl); } catch { /* navigate puede no estar soportado */ }
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
