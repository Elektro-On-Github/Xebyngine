// Install
self.addEventListener("install", e => {
  console.log("SW installato");
  e.waitUntil(
    caches.open("v1").then(cache => cache.addAll([])) // qui devi addare gli html/css/js da cacheare
  );
});

// Fetch
self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

// Push event: mostra una notifica quando arriva un push dal server
self.addEventListener('push', function(event) {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    payload = { title: 'Nuovo messaggio', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Nuovo messaggio';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/static/default.png',
    badge: payload.badge || '/static/default.png',
    data: payload.data || {}
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When the user clicks the notification, focus or open the app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
