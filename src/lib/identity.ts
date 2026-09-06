"use client";

/**
 * Who this browser belongs to.
 *
 * A real product knows this from its own sign-in. This POC has none, so it
 * asks — and it has to ask, because Engage resolves an event to a contact by
 * EMAIL and rejects an event without one. A token captured with no email is a
 * delivery address with nobody attached: it cannot enter a segment, so no
 * campaign will ever reach it.
 *
 * That is worth stating plainly rather than defaulting to an anonymous id.
 * The failure is silent by nature — everything looks like it worked, and the
 * gap only shows up as a campaign that reaches fewer people than expected.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "pwa-poc-identity";

export interface Identity {
  email: string;
  firstName: string;
  lastName: string;
}

export const EMPTY_IDENTITY: Identity = { email: "", firstName: "", lastName: "" };

/** Deliberately loose. Real address validation is a delivery problem, not a form problem. */
export function isUsableEmail(email: string): boolean {
  const value = (email || "").trim();
  return value.length > 3 && value.includes("@") && !value.startsWith("@") && !value.endsWith("@");
}

export function readIdentity(): Identity {
  if (typeof window === "undefined") return EMPTY_IDENTITY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_IDENTITY;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    return {
      email: parsed.email || "",
      firstName: parsed.firstName || "",
      lastName: parsed.lastName || "",
    };
  } catch {
    // Private mode, cleared site data, or a browser that refuses storage.
    return EMPTY_IDENTITY;
  }
}

export function writeIdentity(identity: Identity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    /* refused — the value stays in memory for this session only */
  }
}

/**
 * React binding. Starts empty on the server and settles after mount, so a
 * component rendering before that must treat "no email" as "not yet", not as
 * "this person is anonymous" — which is what `loaded` is for.
 */
export function useIdentity() {
  const [identity, setIdentity] = useState<Identity>(EMPTY_IDENTITY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIdentity(readIdentity());
    setLoaded(true);
  }, []);

  const save = useCallback((next: Identity) => {
    const trimmed: Identity = {
      email: next.email.trim(),
      firstName: next.firstName.trim(),
      lastName: next.lastName.trim(),
    };
    setIdentity(trimmed);
    writeIdentity(trimmed);
    return trimmed;
  }, []);

  return {
    identity,
    loaded,
    save,
    /** True once this browser can be tied to a person in Engage. */
    isIdentified: isUsableEmail(identity.email),
  };
}
