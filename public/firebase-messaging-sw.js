/* eslint-disable no-undef */
/**
 * Push service worker.
 *
 * Must be served from the domain ROOT at exactly /firebase-messaging-sw.js —
 * that is where getToken() looks, and no other path will do.
 *
 * It loads no Firebase SDK, deliberately. FCM only needs a registered worker to
 * attach the push subscription to; what happens on the push event is ours to
 * decide. Parsing the envelope directly means no importScripts from a CDN, no
 * SDK version to keep in step with package.json, and no chance of the SDK and
 * this file both rendering the same notification.
 *
 * Keep SW_VERSION in step with the constant in src/lib/push.ts.
 */

const SW_VERSION = "1.0.0";
const DEFAULT_ICON = "/icon-192.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Report back to any open page — a worker has no console you are watching. */
async function post(message) {
  try {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of clients) {
      client.postMessage({ source: "push", swVersion: SW_VERSION, ...message });
    }
  } catch {
    /* reporting must never break delivery */
  }
}

/**
 * FCM wraps a notification message as
 *   { notification: { title, body, icon, image }, fcmOptions: { link } }
 * and sends a data-only message as { data: {...} }, which displays nothing by
 * itself. Both are handled, so a data-only send still surfaces.
 *
 * fcm_options arrives snake_case on some paths and camelCase on others — accept
 * either rather than silently losing the click destination.
 */
function normalise(payload) {
  if (!payload || typeof payload !== "object") return null;

  const data = payload.data || {};
  const opts = payload.fcmOptions || payload.fcm_options || {};
  const n = payload.notification;

  if (n && typeof n === "object") {
    return {
      title: n.title || "Notification",
      body: n.body || "",
      icon: n.icon || DEFAULT_ICON,
      image: n.image,
      tag: n.tag || data.tag,
      link: opts.link || data.link || "/",
    };
  }

  return {
    title: data.title || "Notification",
    body: data.body || "",
    icon: data.icon || DEFAULT_ICON,
    image: data.image,
    tag: data.tag,
    link: data.link || "/",
  };
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        payload = { data: { body: event.data ? event.data.text() : "" } };
      }

      const p = normalise(payload) || { title: "Notification", body: "", link: "/" };

      try {
        await self.registration.showNotification(p.title, {
          body: p.body,
          icon: p.icon,
          badge: DEFAULT_ICON,
          image: p.image || undefined,
          tag: p.tag || undefined,
          data: { link: p.link, receivedAt: Date.now() },
        });

        // Ask the browser what it now holds. Empty means nothing was created;
        // non-empty with nothing on screen means the OS is suppressing it —
        // two very different problems, otherwise indistinguishable from
        // "the send didn't work".
        const held = await self.registration.getNotifications({});
        await post({ type: "push", ok: true, title: p.title, heldByBrowser: held.length });
      } catch (error) {
        // showNotification rejects rather than throwing synchronously, so
        // without this the failure is completely invisible.
        await post({ type: "push", ok: false, error: String(error && error.message) });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";

  event.waitUntil(
    (async () => {
      // Report before navigating: once a window takes focus this worker can be
      // torn down mid-request. Push has no open metric, so a click is one of
      // only two signals the channel will ever produce.
      try {
        await fetch("/api/push/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link, at: Date.now() }),
          keepalive: true,
        });
      } catch {
        /* a failed beacon must never block the navigation */
      }
      await post({ type: "notificationclick", link });

      // Focus an existing window rather than stacking a new one per tap.
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && link && link !== "/") {
            try {
              await client.navigate(link);
            } catch {
              /* cross-origin — fall through to openWindow */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(link);
    })(),
  );
});

/**
 * The browser rotated the subscription behind our back.
 *
 * Without handling this the device goes silent permanently and nothing reports
 * an error: the server keeps a token that no longer resolves, and every send
 * returns UNREGISTERED long after the user was reachable. The page may not be
 * open, so we flag it and let the next launch's refresh re-mint.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(post({ type: "subscriptionchange" }));
});
