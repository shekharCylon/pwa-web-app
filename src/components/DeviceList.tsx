"use client";

import { useCallback, useEffect, useState } from "react";

interface EngageSync {
  ok: boolean;
  configured: boolean;
  error?: string;
  at: string;
}

interface Device {
  id: string;
  appId: string | null;
  token: string;
  platform: string;
  browser: string;
  deviceId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastClickAt?: string;
  seenCount: number;
  engage?: EngageSync;
}

function ago(iso?: string) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DeviceList({ reloadKey }: { reloadKey: number }) {
  const [devices, setDevices] = useState<Device[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      const json = await res.json();
      setDevices(json.devices ?? []);
    } catch {
      /* the list is a view; a failed poll is not worth an error state */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const remove = async (id: string) => {
    await fetch(`/api/devices/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <section className="card">
      <div className="step">
        <span className="n">4</span> What reached Engage
      </div>

      <div className="spread" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>
          {devices.length} device{devices.length === 1 ? "" : "s"}
        </h2>
        <button className="ghost tiny" onClick={load}>Refresh</button>
      </div>
      <p className="sub">
        Every device this app has captured. The badge is the one that matters: a device Engage did
        not take is stored here and reachable by nobody — a campaign will simply skip it, with no
        error to explain why.
      </p>

      {devices.length === 0 ? (
        <p className="empty">
          Nothing yet. Turn on notifications above and this fills in.
        </p>
      ) : (
        devices.map((d) => (
          <div className="dev" key={d.id}>
            <div className="spread">
              <div style={{ minWidth: 0 }}>
                <div className="who">
                  <strong style={{ fontSize: 14 }}>{d.platform}</strong>
                  <span className="pill">{d.browser}</span>
                  <span className={`pill ${d.status === "active" ? "ok" : "bad"}`}>
                    <i className="dot" /> {d.status}
                  </span>
                  {d.seenCount > 1 && (
                    <span className="pill">seen {d.seenCount}×</span>
                  )}
                  <span
                    className={`pill ${d.engage?.ok ? "ok" : "bad"}`}
                    title={d.engage?.error ?? (d.engage?.ok ? "Engage stored this device." : "")}
                  >
                    <i className="dot" />{" "}
                    {d.engage?.ok
                      ? "in Engage"
                      : d.engage
                        ? d.engage.configured
                          ? "not in Engage"
                          : "not connected"
                        : "not reported"}
                  </span>
                </div>
                <div className="meta">
                  {d.email ? (
                    <>
                      {[d.firstName, d.lastName].filter(Boolean).join(" ") || d.email}
                      {d.firstName || d.lastName ? ` · ${d.email}` : ""} ·{" "}
                    </>
                  ) : (
                    <>no email — cannot be attached to a contact · </>
                  )}
                  first {ago(d.firstSeenAt)} · last {ago(d.lastSeenAt)}
                  {d.lastClickAt ? ` · clicked ${ago(d.lastClickAt)}` : ""}
                </div>
                {d.engage && !d.engage.ok && d.engage.error && (
                  <div className="meta" style={{ color: "var(--bad, #b42318)" }}>
                    {d.engage.error}
                  </div>
                )}
                <div className="mono" style={{ color: "var(--faint)", marginTop: 4 }}>
                  …{d.token.slice(-28)}
                </div>
              </div>
              <button className="danger tiny" onClick={() => remove(d.id)}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
