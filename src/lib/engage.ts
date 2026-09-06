/**
 * Engage client. SERVER ONLY.
 *
 * This module reads ENGAGE_APP_SECRET, which must never reach a browser. It has
 * no "use client" directive and no NEXT_PUBLIC_ variables, and nothing under
 * src/components imports it — the browser talks to this app's own API routes,
 * and only those routes talk to Engage.
 *
 * What it sends is an ordinary event. Engage has no push-specific ingestion
 * endpoint and does not need one: the configured event (default
 * `push_notification`) carrying a `device_token` property is recognised on
 * arrival, so the same call that makes a device reachable also makes
 * "subscribed to push in the last 30 days" a normal segment condition.
 */
import "server-only";

const BASE = (process.env.ENGAGE_API_URL || "").replace(/\/+$/, "");
const APP_ID = process.env.ENGAGE_APP_ID || "";
const APP_SECRET = process.env.ENGAGE_APP_SECRET || "";
const EVENT = process.env.ENGAGE_PUSH_EVENT || "push_notification";
const ENVIRONMENT = process.env.ENGAGE_PUSH_ENVIRONMENT || "stage";

/** Engage refuses a slow ingest better than we handle a hung request. */
const TIMEOUT_MS = 8000;

export interface EngageIdentity {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface EngageResult {
  /** True only when Engage stored the event. */
  ok: boolean;
  /** Why not, in words an operator can act on. */
  error?: string;
  /** Engage's contact id, when it accepted. */
  profileId?: string;
  /** False when this app is not configured to talk to Engage at all. */
  configured: boolean;
}

export function isConfigured(): boolean {
  return Boolean(BASE && APP_ID && APP_SECRET);
}

/**
 * What the UI may know about the connection. Deliberately omits the secret and
 * anything derived from it — this is the shape that crosses to the browser.
 */
export function describeConnection() {
  return {
    configured: isConfigured(),
    host: BASE || null,
    appId: APP_ID ? `${APP_ID.slice(0, 12)}…` : null,
    event: EVENT,
    environment: ENVIRONMENT,
    missing: [
      !BASE && "ENGAGE_API_URL",
      !APP_ID && "ENGAGE_APP_ID",
      !APP_SECRET && "ENGAGE_APP_SECRET",
    ].filter(Boolean) as string[],
  };
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Report one device token to Engage.
 *
 * Email is required and that is not our rule — Engage resolves an event to a
 * contact by email and rejects it outright without one. A token reported
 * anonymously would be stored nowhere and belong to nobody, so this returns a
 * plain refusal rather than firing a call that cannot succeed. The caller must
 * surface it: a token that never reached Engage looks exactly like one that
 * did, right up until the campaign misses that person.
 */
export async function reportDeviceToken(input: {
  token: string;
  identity: EngageIdentity;
  platform?: string | null;
  browser?: string | null;
  deviceId?: string | null;
  swVersion?: string | null;
  userAgent?: string | null;
  source?: string | null;
}): Promise<EngageResult> {
  if (!isConfigured()) {
    const { missing } = describeConnection();
    return {
      ok: false,
      configured: false,
      error: `Not connected to Engage — set ${missing.join(", ")} in .env.local.`,
    };
  }

  const email = (input.identity.email || "").trim();
  if (!email) {
    return {
      ok: false,
      configured: true,
      error:
        "Engage identifies people by email, and rejects an event without one. " +
        "The token was stored here but Engage has not been told about it.",
    };
  }

  try {
    const { status, json } = await post(
      "/api/v1/events",
      {
        event_type: EVENT,
        user: {
          email,
          first_name: input.identity.firstName || undefined,
          last_name: input.identity.lastName || undefined,
        },
        properties: {
          device_token: input.token,
          platform: input.platform || undefined,
          browser: input.browser || undefined,
          device_id: input.deviceId || undefined,
          sw_version: input.swVersion || undefined,
          environment: ENVIRONMENT,
          source: input.source || undefined,
        },
      },
      {
        "X-App-Id": APP_ID,
        "X-App-Secret": APP_SECRET,
        // Engage reads this to work out the platform when the site does not
        // send one. Forwarded from the real browser, not this server.
        ...(input.userAgent ? { "User-Agent": input.userAgent } : {}),
      },
    );

    // Ingestion always answers 200 and puts the outcome in the body, so the
    // HTTP status alone would report every rejection as a success.
    if (status !== 200) {
      return { ok: false, configured: true, error: `Engage answered HTTP ${status}.` };
    }
    if (json?.success === true) {
      return { ok: true, configured: true, profileId: json.profile_id as string | undefined };
    }
    return {
      ok: false,
      configured: true,
      error: (json?.error as string) || "Engage rejected the event without saying why.",
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      configured: true,
      error: aborted ? `Engage did not answer within ${TIMEOUT_MS}ms.` : String(e),
    };
  }
}

/**
 * Tell Engage a notification was clicked.
 *
 * Worth doing even in a POC. Web push has no delivery receipt and no open
 * metric, so a click is one of only two signals the channel produces — the
 * other being "the push service accepted it", which is not delivery.
 */
export async function reportClick(token: string, link?: string | null): Promise<EngageResult> {
  if (!isConfigured()) return { ok: false, configured: false, error: "Not connected to Engage." };
  try {
    const { status } = await post("/api/v1/push/click", { token, link: link || undefined });
    return { ok: status === 200, configured: true };
  } catch (e) {
    return { ok: false, configured: true, error: String(e) };
  }
}

/** Tell Engage this device opted out. */
export async function reportOptOut(token: string): Promise<EngageResult> {
  if (!isConfigured()) return { ok: false, configured: false, error: "Not connected to Engage." };
  try {
    const { status } = await post("/api/v1/push/token/disable", { token });
    return { ok: status === 200, configured: true };
  } catch (e) {
    return { ok: false, configured: true, error: String(e) };
  }
}

/**
 * Check the connection without writing anything.
 *
 * Uses a trick worth explaining: ingestion rejects an event with no email
 * ("email is required") and rejects bad credentials ("invalid app
 * credentials"), and it checks the credentials FIRST. So posting an event with
 * no email tells the two apart precisely, and stores nothing either way — no
 * contact created, no test event polluting a segment.
 *
 * A health endpoint would be cleaner. This has the advantage of testing the
 * exact call the real relay makes, over the same headers, against the same
 * route — which is what actually goes wrong.
 */
export async function testConnection(): Promise<{
  ok: boolean;
  reachable: boolean;
  credentialsValid: boolean;
  detail: string;
}> {
  if (!isConfigured()) {
    const { missing } = describeConnection();
    return {
      ok: false,
      reachable: false,
      credentialsValid: false,
      detail: `Not configured — set ${missing.join(", ")} in .env.local and restart.`,
    };
  }

  try {
    const { status, json } = await post(
      "/api/v1/events",
      // No email on purpose: this must never create anything.
      { event_type: EVENT, user: {}, properties: {} },
      { "X-App-Id": APP_ID, "X-App-Secret": APP_SECRET },
    );

    if (status !== 200) {
      return {
        ok: false,
        reachable: true,
        credentialsValid: false,
        detail: `${BASE} answered HTTP ${status}. Is that the Engage API?`,
      };
    }

    const error = String(json?.error || "");
    if (error.includes("invalid app credentials")) {
      return {
        ok: false,
        reachable: true,
        credentialsValid: false,
        detail:
          "Engage is reachable but rejected the credentials. Check ENGAGE_APP_ID and " +
          "ENGAGE_APP_SECRET against Engage -> Settings -> App credentials.",
      };
    }
    if (error.includes("email is required")) {
      // The only answer that proves both halves: reached, and authenticated.
      return {
        ok: true,
        reachable: true,
        credentialsValid: true,
        detail: `Connected to ${BASE}. Credentials accepted.`,
      };
    }
    return {
      ok: true,
      reachable: true,
      credentialsValid: true,
      detail: `Connected to ${BASE}. Engage answered: ${error || "no error"}.`,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      reachable: false,
      credentialsValid: false,
      detail: aborted
        ? `${BASE} did not answer within ${TIMEOUT_MS}ms. Is it running?`
        : `Could not reach ${BASE}. ${String(e)}`,
    };
  }
}
