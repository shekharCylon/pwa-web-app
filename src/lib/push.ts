"use client";

/**
 * Web push, self-contained.
 *
 * Everything the app needs to detect support, request permission, mint an FCM
 * token and keep it current. No wrapper library — the Firebase SDK is the only
 * dependency, and it is loaded lazily.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

/** Web Push certificate public key — Console → Cloud Messaging. */
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;

const APP_ID = "pwa-poc";

/** FCM requires this exact path, served from the domain root. */
const SW_PATH = "/firebase-messaging-sw.js";

/**
 * Firebase's own default scope — deliberately NOT "/".
 *
 * Many apps register their own root-scope worker, and some unregister whatever
 * controls the page on boot. Keeping push off the root scope means it cannot be
 * taken down by either.
 */
const SW_SCOPE = "/firebase-cloud-messaging-push-scope";

const TOKEN_KEY = "poc_push_token";
const DEVICE_ID_KEY = "poc_device_id";

import { readIdentity } from "./identity";

export type Platform = "ios" | "android" | "desktop" | "unknown";

export type SupportReason =
  | "server"
  | "unsupported_browser"
  | "insecure_context"
  | "ios_not_installed"
  | "missing_config"
  | null;

export interface SupportResult {
  supported: boolean;
  reason: SupportReason;
}

// ── Environment ─────────────────────────────────────────────────────────────

/**
 * iPadOS 13+ reports a Mac user-agent, so touch points is the only reliable
 * tell. Without this an iPad is classified as desktop and we would prompt for
 * a permission it cannot grant outside standalone mode.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (isIOS()) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}

export function detectBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/edg\//.test(ua)) return "Edge";
  if (/opr\/|opera/.test(ua)) return "Opera";
  if (/firefox|fxios/.test(ua)) return "Firefox";
  if (/chrome|crios/.test(ua)) return "Chrome";
  if (/safari/.test(ua)) return "Safari";
  return "unknown";
}

/**
 * Can this browser receive push right now — and if not, exactly why?
 *
 * A reason rather than a bare boolean, so the UI can hide the opt-in control,
 * show install steps on iOS, or explain an unreachable state.
 */
export function getPushSupport(): SupportResult {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "server" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { supported: false, reason: "unsupported_browser" };
  }
  // Push needs a secure context. localhost qualifies; a LAN address does not,
  // which is why testing on a phone needs a tunnel.
  if (!window.isSecureContext) {
    return { supported: false, reason: "insecure_context" };
  }
  // Apple grants push only to a PWA launched from the Home Screen. Prompting in
  // a Safari tab fails, and spends the one permission request this origin gets.
  if (isIOS() && !isStandalone()) {
    return { supported: false, reason: "ios_not_installed" };
  }
  if (!VAPID_KEY || !firebaseConfig.projectId) {
    return { supported: false, reason: "missing_config" };
  }
  return { supported: true, reason: null };
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// ── Local identity ──────────────────────────────────────────────────────────

/**
 * A stable per-browser id.
 *
 * Deliberately separate from the push token: this identifies a device over
 * time, while the token is a delivery address that rotates. Storing both is
 * what lets a rotated token still be tied back to the same device.
 */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** localStorage throws outright in some privacy modes, so every access is guarded. */
function readLastToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function writeLastToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode — we re-send on the next launch instead */
  }
}

function clearLastToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to do */
  }
}

// ── Service worker ──────────────────────────────────────────────────────────

/**
 * Wait for THIS registration to activate.
 *
 * Deliberately not `navigator.serviceWorker.ready`: that resolves only for the
 * worker whose scope covers the current page, and ours is scoped away from "/"
 * on purpose. Awaiting `.ready` here never resolves, so the opt-in hangs
 * forever with no error logged anywhere.
 */
function waitForActive(reg: ServiceWorkerRegistration, timeout = 10000) {
  return new Promise<ServiceWorkerRegistration>((resolve) => {
    if (reg.active) return resolve(reg);
    const worker = reg.installing || reg.waiting;
    if (!worker) return resolve(reg);

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      worker.removeEventListener("statechange", onChange);
      resolve(reg);
    };
    const onChange = () => {
      if (worker.state === "activated" || worker.state === "redundant") done();
    };
    worker.addEventListener("statechange", onChange);
    setTimeout(done, timeout);
  });
}

export async function findRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const regs = await navigator.serviceWorker.getRegistrations();
  return regs.find((r) => new URL(r.scope).pathname === SW_SCOPE) ?? null;
}

// ── Firebase ────────────────────────────────────────────────────────────────

let firebasePromise: Promise<{
  app: import("firebase/app").FirebaseApp;
  messaging: typeof import("firebase/messaging");
}> | null = null;

/** Loaded lazily so the SDK stays out of the main bundle and never runs on the server. */
function loadFirebase() {
  if (!firebasePromise) {
    firebasePromise = (async () => {
      const [appMod, messaging] = await Promise.all([
        import("firebase/app"),
        import("firebase/messaging"),
      ]);
      const app = appMod.getApps().length
        ? appMod.getApps()[0]
        : appMod.initializeApp(firebaseConfig);
      return { app, messaging };
    })();
  }
  return firebasePromise;
}

/**
 * Ask Google for this device's registration token.
 *
 * getToken() caches: the first call is a network round trip, later calls return
 * the cached value unless the browser rotated it. Calling it on every launch is
 * therefore cheap, and is how a rotation gets noticed.
 */
async function mintToken(): Promise<string> {
  const { app, messaging } = await loadFirebase();
  const { getMessaging, getToken, isSupported } = messaging;

  if (!(await isSupported())) throw new Error("fcm_unsupported");

  // Registered explicitly rather than letting the SDK do it implicitly, so a
  // failure surfaces as a service worker error instead of an opaque rejection.
  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
  await waitForActive(reg);

  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  });
  if (!token) throw new Error("no_token_returned");
  return token;
}

// ── Server ──────────────────────────────────────────────────────────────────

/**
 * The last thing we heard from our own server about this token, so the UI can
 * say whether Engage actually has it. Held in memory rather than persisted:
 * it is about the last attempt, not about the device.
 */
export interface SyncState {
  ok: boolean;
  engage?: { ok: boolean; error?: string; configured: boolean };
}

let lastSync: SyncState | null = null;

export function getLastSync(): SyncState | null {
  return lastSync;
}

async function sendToServer(token: string): Promise<boolean> {
  try {
    // Read at call time, not at module load: someone can fill in their email
    // after the first refresh has already run.
    const identity = readIdentity();
    const res = await fetch("/api/push/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: APP_ID,
        token,
        platform: detectPlatform(),
        browser: detectBrowser(),
        swVersion: SW_VERSION,
        deviceId: getDeviceId(),
        userId: null,
        email: identity.email || null,
        firstName: identity.firstName || null,
        lastName: identity.lastName || null,
      }),
    });
    if (!res.ok) throw new Error(`register failed: ${res.status}`);

    const body = (await res.json().catch(() => ({}))) as {
      engage?: { ok: boolean; error?: string; configured: boolean };
    };
    lastSync = { ok: true, engage: body.engage };

    // Only remembered as sent when Engage took it. Otherwise the next launch
    // retries — which is the whole point of re-reporting on every launch, and
    // is how a token captured before someone entered their email still
    // reaches Engage once they do.
    if (body.engage?.ok !== false) writeLastToken(token);
    return true;
  } catch (e) {
    // Not thrown: a failed register must not look like a failed opt-in. But we
    // do NOT record the token as sent, so the next refresh retries it.
    console.warn("[push] register failed", e);
    lastSync = { ok: false };
    return false;
  }
}

/** Must match the SW_VERSION in public/firebase-messaging-sw.js. */
export const SW_VERSION = "1.0.0";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * The device's live token, or null.
 *
 * null is not an error: it is the normal answer for a browser that cannot do
 * push, for iOS outside standalone mode, and for anyone who has not opted in.
 *
 * Pass { prompt: true } ONLY from a click handler. A user who dismisses or
 * blocks the prompt can never be asked again — a blocked origin is permanently
 * unreachable for push, with no recovery path in any browser.
 */
export async function getDeviceToken({ prompt = false } = {}): Promise<string | null> {
  if (!getPushSupport().supported) return null;

  let permission = getPushPermission();
  if (permission !== "granted") {
    if (!prompt) return null;
    try {
      permission = await Notification.requestPermission();
    } catch {
      return null;
    }
    if (permission !== "granted") return null;
  }

  try {
    return await mintToken();
  } catch (e) {
    console.warn("[push] could not mint a token", e);
    return null;
  }
}

/** Prompt, mint, and register. For a "Turn on notifications" button. */
export async function enablePush(): Promise<{
  ok: boolean;
  token: string | null;
  reason: string | null;
}> {
  const support = getPushSupport();
  if (!support.supported) return { ok: false, token: null, reason: support.reason };

  const token = await getDeviceToken({ prompt: true });
  if (!token) {
    return {
      ok: false,
      token: null,
      reason: getPushPermission() === "denied" ? "permission_denied" : "not_granted",
    };
  }

  await sendToServer(token);
  return { ok: true, token, reason: null };
}

/**
 * Call on every launch. Never prompts.
 *
 * The piece most integrations forget, and the one that decides whether the
 * channel survives. FCM tokens rotate silently — on data clear, on reinstall,
 * on Google's own schedule — and nothing tells the server. Register only at
 * opt-in and the list decays to nothing while the dashboards still look
 * healthy, because a dead token fails at send time, not at rest.
 */
export async function refreshPushToken(): Promise<{ ok: boolean; token?: string }> {
  if (getPushPermission() !== "granted") return { ok: false };
  if (!getPushSupport().supported) return { ok: false };

  const token = await getDeviceToken();
  if (!token) return { ok: false };

  // Only hit the server when the value actually changed.
  if (token !== readLastToken()) await sendToServer(token);
  return { ok: true, token };
}

/** Opt out: revoke at Google, then tell the server to stop using it. */
export async function disablePush(): Promise<{ ok: boolean }> {
  const token = readLastToken();
  try {
    const { app, messaging } = await loadFirebase();
    await messaging.deleteToken(messaging.getMessaging(app));
  } catch {
    /* best effort — the server row is what gates sending */
  }
  try {
    await fetch("/api/push/token/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, deviceId: getDeviceId() }),
    });
  } catch {
    /* permission is gone, so refresh will not re-add it */
  }
  clearLastToken();
  return { ok: true };
}

/** Everything needed to explain a failure without a debugger attached. */
export async function inspectPush() {
  const reg = await findRegistration();
  return {
    appId: APP_ID,
    swVersion: SW_VERSION,
    support: getPushSupport(),
    permission: getPushPermission(),
    platform: detectPlatform(),
    browser: detectBrowser(),
    standalone: isStandalone(),
    workerRegistered: Boolean(reg),
    workerState: reg?.active?.state ?? null,
    deviceId: getDeviceId(),
    lastKnownToken: readLastToken(),
  };
}

/**
 * Report the current token to Engage right now, and say what happened.
 *
 * Distinct from refresh(): that is the silent every-launch path, and it hides
 * its result because a background sync must never interrupt anyone. This is
 * the one a button calls, so it returns the outcome to be shown.
 */
export async function reportNow(): Promise<{
  ok: boolean;
  token?: string;
  engage?: { ok: boolean; error?: string; configured: boolean };
  error?: string;
}> {
  let token: string | null = null;
  try {
    token = await getDeviceToken();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!token) {
    return {
      ok: false,
      error:
        "No token yet. Turn on notifications first — on iOS the app must be " +
        "opened from its Home Screen icon before push works at all.",
    };
  }

  // Force the send even if this token was already reported: the point of the
  // button is to retry, most often right after an email was finally entered.
  const sent = await sendToServer(token);
  const sync = getLastSync();
  return { ok: sent, token, engage: sync?.engage };
}
