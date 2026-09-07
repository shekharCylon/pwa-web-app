"use client";

import { useEffect, useRef, useState } from "react";
import { usePush } from "@/lib/usePush";
import { getLastSync, reportNow } from "@/lib/push";
import { useIdentity } from "@/lib/identity";

const WHY: Record<string, string> = {
  ios_not_installed:
    "On iOS, notifications only work once the app is installed to the Home Screen. Do step 1 first, then open the app from its icon.",
  insecure_context:
    "Push needs HTTPS. localhost counts; a LAN address like 192.168.x.x does not — use a tunnel to test on a phone.",
  unsupported_browser: "This browser has no Push API.",
  missing_config: "Firebase config or the VAPID key is missing from .env.local.",
  server: "Still loading.",
};

export default function PushCard({
  onCaptured,
  reportKey = 0,
}: {
  onCaptured: () => void;
  reportKey?: number;
}) {
  const { support, permission, token, deviceId, busy, error, canPrompt, isBlocked, enable, refresh } =
    usePush();
  const { isIdentified, loaded: identityLoaded } = useIdentity();
  // Which field is showing "Copied", not merely whether one is. Two buttons
  // sharing a boolean would let the first one's timer clear the second one's
  // label early.
  const [copied, setCopied] = useState<"token" | "deviceId" | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sync, setSync] = useState<ReturnType<typeof getLastSync>>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Refresh on every launch. Never prompts, returns immediately if the user
  // has not opted in — and it is what keeps a rotated token from going stale
  // on the server without anyone noticing.
  // `reportKey` changes when the identity is saved, which re-runs this — a
  // token captured before the email was entered was refused by Engage, and
  // this is the moment it can finally be reported.
  useEffect(() => {
    void refresh().then((r) => {
      setSync(getLastSync());
      if (r?.ok) onCaptured();
    });
  }, [refresh, onCaptured, reportKey]);

  const turnOn = async () => {
    const result = await enable();
    setSync(getLastSync());
    if (result?.ok) onCaptured();
  };

  const sendToEngage = async () => {
    setSending(true);
    setSendError(null);
    try {
      const result = await reportNow();
      setSync(getLastSync());
      if (!result.ok && result.error) setSendError(result.error);
      onCaptured();
    } finally {
      setSending(false);
    }
  };

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const copy = async (field: "token" | "deviceId", value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      setCopied(field);
      copiedTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked — both values are on screen to select by hand */
    }
  };

  return (
    <section className="card">
      <div className={`step ${permission === "granted" ? "done" : ""}`}>
        <span className="n">3</span> Capture the device token
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
      {sendError && <div className="banner bad">{sendError}</div>}

      {/* The step that actually decides whether a campaign can reach this
          person. A granted permission and a live token say nothing about it. */}
      {token && identityLoaded && !isIdentified && (
        <div className="banner warn">
          <strong>This token has not reached Engage.</strong> It was captured and stored here, but
          with no email there is no contact to attach it to, so no segment can reach it. Fill in
          step 1 and it is reported automatically.
        </div>
      )}

      {token && sync?.engage && (
        <div className={`banner ${sync.engage.ok ? "ok" : "warn"}`}>
          {sync.engage.ok ? (
            <>Engage has this device. It will appear under Push Notifications &rarr; Devices.</>
          ) : (
            <>
              <strong>Engage did not take this token.</strong> {sync.engage.error}
            </>
          )}
        </div>
      )}

      {token && (
        <>
          <div className="spread" style={{ marginTop: 14 }}>
            <span className="idlabel">Push token</span>
            <button className="ghost tiny" onClick={() => copy("token", token)}>
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="tok" style={{ marginTop: 4 }}>{token}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={sendToEngage} disabled={sending}>
              {sending ? "Sending…" : "Send to Engage"}
            </button>
            <span style={{ fontSize: 12, color: "var(--faint)" }}>
              reported to Engage on every launch, because tokens rotate silently
            </span>
          </div>
        </>
      )}

      {/* Shown whether or not a token exists: it is minted on first load, and
          it is the id to quote when matching this browser against a row in the
          Engage dashboard — including before notifications are ever enabled. */}
      {deviceId && (
        <>
          <div className="spread" style={{ marginTop: 16 }}>
            <span className="idlabel">Device id</span>
            <button className="ghost tiny" onClick={() => copy("deviceId", deviceId)}>
              {copied === "deviceId" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="tok" style={{ marginTop: 4 }}>{deviceId}</div>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: "6px 0 0" }}>
            Stable for this browser. The token is a delivery address and rotates silently; this
            does not, which is how a rotated token is still recognised as the same device.
          </p>
        </>
      )}
    </section>
  );
}
