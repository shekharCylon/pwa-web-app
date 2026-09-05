"use client";

import { useEffect, useState } from "react";
import { usePush } from "@/lib/usePush";

const WHY: Record<string, string> = {
  ios_not_installed:
    "On iOS, notifications only work once the app is installed to the Home Screen. Do step 1 first, then open the app from its icon.",
  insecure_context:
    "Push needs HTTPS. localhost counts; a LAN address like 192.168.x.x does not — use a tunnel to test on a phone.",
  unsupported_browser: "This browser has no Push API.",
  missing_config: "Firebase config or the VAPID key is missing from .env.local.",
  server: "Still loading.",
};

export default function PushCard({ onCaptured }: { onCaptured: () => void }) {
  const { support, permission, token, busy, error, canPrompt, isBlocked, enable, refresh } =
    usePush();
  const [copied, setCopied] = useState(false);

  // Refresh on every launch. Never prompts, returns immediately if the user
  // has not opted in — and it is what keeps a rotated token from going stale
  // on the server without anyone noticing.
  useEffect(() => {
    void refresh().then((r) => {
      if (r?.ok) onCaptured();
    });
  }, [refresh, onCaptured]);

  const turnOn = async () => {
    const result = await enable();
    if (result?.ok) onCaptured();
  };

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the token is on screen to select by hand */
    }
  };

  return (
    <section className="card">
      <div className={`step ${permission === "granted" ? "done" : ""}`}>
        <span className="n">2</span> Capture the device token
      </div>

      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Notifications</h2>
        <span
          className={`pill ${
            permission === "granted" ? "ok" : permission === "denied" ? "bad" : ""
          }`}
        >
          <i className="dot" /> {permission}
        </span>
      </div>

      {isBlocked ? (
        <div className="banner bad">
          Notifications are blocked for this site. A blocked origin can never be
          prompted again — reset it in the browser&rsquo;s site settings to try
          again.
        </div>
      ) : !support.supported ? (
        <div className="banner warn">
          {WHY[support.reason ?? ""] ?? `Not available: ${support.reason}`}
        </div>
      ) : canPrompt ? (
        <>
          <p className="sub" style={{ margin: 0 }}>
            Grants permission, mints a token with Firebase, and posts it to this
            app&rsquo;s API.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={turnOn} disabled={busy}>
              {busy ? "Working…" : "Turn on notifications"}
            </button>
          </div>
        </>
      ) : (
        <div className="banner ok">
          Permission granted. The token below is stored, and refreshed on every
          launch.
        </div>
      )}

      {error && <div className="banner bad">{error}</div>}

      {token && (
        <>
          <div className="tok">{token}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost tiny" onClick={copy}>
              {copied ? "Copied" : "Copy token"}
            </button>
            <span style={{ fontSize: 12, color: "var(--faint)" }}>
              paste into the push console to send a test
            </span>
          </div>
        </>
      )}
    </section>
  );
}
