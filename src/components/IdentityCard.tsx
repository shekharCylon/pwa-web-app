"use client";

import { useEffect, useState } from "react";
import { useIdentity, isUsableEmail, type Identity } from "@/lib/identity";

interface Connection {
  configured: boolean;
  host: string | null;
  appId: string | null;
  event: string;
  environment: string;
  missing: string[];
}

/**
 * Who this browser belongs to, and where the token is going.
 *
 * The email is not a nicety. Engage resolves an event to a contact by email
 * and refuses one without it, so a token captured before this is filled in is
 * stored here and known to nobody — it cannot enter a segment, and no campaign
 * will ever reach it. That failure is invisible from the browser: permission
 * says granted, a token exists, everything looks done. This card exists to
 * make it visible.
 */
export default function IdentityCard({ onSaved }: { onSaved: () => void }) {
  const { identity, loaded, save, isIdentified } = useIdentity();
  const [draft, setDraft] = useState<Identity>({ email: "", firstName: "", lastName: "" });
  const [saved, setSaved] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    if (loaded) setDraft(identity);
  }, [loaded, identity]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engage")
      .then((r) => r.json())
      .then((c: Connection) => {
        if (!cancelled) setConnection(c);
      })
      .catch(() => {
        /* the card still works; it just cannot describe the connection */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Re-report immediately: a token captured before this was filled in is
    // still sitting here unreported, and this is the moment it can be sent.
    onSaved();
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/engage/test", { method: "POST" });
      setTestResult(await res.json());
    } catch (e) {
      setTestResult({ ok: false, detail: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const emailOk = isUsableEmail(draft.email);

  return (
    <section className="card">
      <div className={`step ${isIdentified ? "done" : ""}`}>
        <span className="n">1</span> Say who you are
      </div>

      <p style={{ color: "var(--faint)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
        Engage identifies people by email and rejects an event without one. A real app knows this
        from its own sign-in; this one asks.
      </p>

      <form onSubmit={submit}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Email
        </label>
        <input
          type="email"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          placeholder="you@example.com"
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              First name
            </label>
            <input
              value={draft.firstName}
              onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
              placeholder="Ada"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Last name
            </label>
            <input
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
              placeholder="Lovelace"
              style={inputStyle}
            />
          </div>
        </div>

        <button type="submit" disabled={!emailOk} style={{ marginTop: 14 }}>
          {saved ? "Saved" : "Save and report to Engage"}
        </button>
        {!emailOk && draft.email.length > 0 && (
          <span style={{ marginLeft: 10, fontSize: 13, color: "var(--faint)" }}>
            That does not look like an email address.
          </span>
        )}
      </form>

      {connection && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--line, rgba(0,0,0,.1))",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--faint)",
          }}
        >
          {connection.configured ? (
            <>
              Reporting <code className="mono">{connection.event}</code> to{" "}
              <code className="mono">{connection.host}</code> as{" "}
              <code className="mono">{connection.appId}</code> ·{" "}
              <span className="pill ok">
                <i className="dot" /> {connection.environment}
              </span>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="ghost tiny" onClick={runTest} disabled={testing}>
                  {testing ? "Checking…" : "Test the connection"}
                </button>
                <span style={{ fontSize: 12 }}>writes nothing</span>
              </div>
              {testResult && (
                <div className={`banner ${testResult.ok ? "ok" : "bad"}`} style={{ marginTop: 10 }}>
                  {testResult.detail}
                </div>
              )}
            </>
          ) : (
            <>
              <strong>Not connected to Engage.</strong> Set{" "}
              {connection.missing.map((m, i) => (
                <span key={m}>
                  {i > 0 && ", "}
                  <code className="mono">{m}</code>
                </span>
              ))}{" "}
              in <code className="mono">.env.local</code> and restart. Tokens are still captured
              locally, but nothing is being reported.
            </>
          )}
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid var(--line, rgba(0,0,0,.18))",
  background: "var(--bg, #fff)",
  color: "inherit",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
