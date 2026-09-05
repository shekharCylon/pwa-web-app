"use client";

import { createPushClient } from "@shekharcylon/push-web";

/**
 * One client, created once at module scope.
 *
 * Not inside a component: a client rebuilt on every render re-registers the
 * service worker each time.
 */
export const push = createPushClient({
  appId: "pwa-poc",

  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  },
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!,

  // The sync layer: the package handles mint → compare → register, and only
  // calls us when the token actually changed.
  sync: {
    register: (payload) =>
      fetch("/api/push/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => {
        // The SDK swallows a rejection here by design. Surfacing it in the
        // console at least makes a broken endpoint visible during a POC.
        if (!r.ok) throw new Error(`register failed: ${r.status}`);
        return r.json();
      }),

    unregister: (payload) =>
      fetch("/api/push/token/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),

    // A stable per-browser id, so a rotated token can still be tied back to the
    // same device. Deliberately separate from the token: one is an identity,
    // the other is a delivery address with a much shorter life.
    getDeviceId: () => {
      try {
        let id = localStorage.getItem("poc_device_id");
        if (!id) {
          id = crypto.randomUUID();
          localStorage.setItem("poc_device_id", id);
        }
        return id;
      } catch {
        return null;
      }
    },

    getUserId: () => null,
  },
});
