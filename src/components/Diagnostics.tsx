"use client";

import { useEffect, useState } from "react";
import { inspectPush } from "@/lib/push";

/**
 * Everything needed to explain a failure without a debugger attached.
 *
 * Testing push means testing on a phone, where there is no console — so the
 * page has to be able to say why it will not work.
 */
export default function Diagnostics() {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState(false);
  const [swServed, setSwServed] = useState<string>("checking…");

  const refresh = async () => {
    setInfo(await inspectPush());
    try {
      const res = await fetch("/firebase-messaging-sw.js", { cache: "no-store" });
      const type = res.headers.get("content-type") ?? "";
      // If the app's router swallows this path and returns HTML, getToken()
      // fails with an error that explains nothing. Check it explicitly.
      setSwServed(type.includes("javascript") ? "served as JavaScript" : `WRONG: ${type}`);
    } catch {
      setSwServed("unreachable");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!info) return null;

  const support = info.support as { supported: boolean; reason: string | null };

  return (
    <section className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Diagnostics</h2>
        <button className="ghost tiny" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <dl className="diag" style={{ marginTop: 12 }}>
          <div>
            <dt>Push supported</dt>
            <dd style={{ color: support.supported ? "var(--ok)" : "var(--bad)" }}>
              {support.supported ? "yes" : support.reason}
            </dd>
          </div>
          <div><dt>Permission</dt><dd>{String(info.permission)}</dd></div>
          <div><dt>Platform</dt><dd>{String(info.platform)} · {String(info.browser)}</dd></div>
          <div><dt>Service worker</dt><dd>{info.workerRegistered ? String(info.workerState) : "not registered"}</dd></div>
          <div><dt>Worker file</dt><dd style={{ color: swServed.startsWith("WRONG") ? "var(--bad)" : undefined }}>{swServed}</dd></div>
          <div><dt>SW version</dt><dd>{String(info.swVersion)}</dd></div>
          <div><dt>Standalone</dt><dd>{info.standalone ? "yes (installed)" : "no (browser tab)"}</dd></div>
          <div><dt>Secure context</dt><dd>{typeof window !== "undefined" && window.isSecureContext ? "yes" : "NO"}</dd></div>
          <div><dt>Device id</dt><dd>{info.deviceId ? `…${String(info.deviceId).slice(-12)}` : "none"}</dd></div>
          <div><dt>Last known token</dt><dd>{info.lastKnownToken ? `…${String(info.lastKnownToken).slice(-12)}` : "none"}</dd></div>
        </dl>
      )}

      {open && (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost tiny" onClick={refresh}>Re-check</button>
        </div>
      )}
    </section>
  );
}
