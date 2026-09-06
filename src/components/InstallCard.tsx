"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop" | "unknown";

function detect(): { platform: Platform; browser: string; standalone: boolean } {
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS 13+ reports a Mac UA; touch points is the only reliable tell.
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  let browser = "unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua)) browser = "Opera";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua)) browser = "Safari";

  const platform: Platform = isIOS
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : /Windows|Macintosh|Linux|CrOS/i.test(ua)
        ? "desktop"
        : "unknown";

  return { platform, browser, standalone };
}

export default function InstallCard({ onInstalled }: { onInstalled: () => void }) {
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    setEnv(detect());

    // Chrome on Android and desktop fires this when the app is installable.
    // Safari never does — hence the manual steps below.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalledEvt = () => {
      setEnv(detect());
      setOutcome("installed");
      onInstalled();
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalledEvt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalledEvt);
    };
  }, [onInstalled]);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setOutcome(choice.outcome);
    // prompt() is single-use; the event cannot be replayed.
    setDeferred(null);
  };

  if (!env) return null;

  const { platform, browser, standalone } = env;

  return (
    <section className="card">
      <div className={`step ${standalone ? "done" : ""}`}>
        <span className="n">2</span> Install the app
      </div>

      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          {standalone ? "Running as an installed app" : "Add this to your device"}
        </h2>
        <span className={`pill ${standalone ? "ok" : ""}`}>
          <i className="dot" /> {platform} · {browser}
        </span>
      </div>

      {standalone ? (
        <div className="banner ok">
          Installed and launched from the home screen or dock. This is the state iOS
          requires before it will allow notifications at all.
        </div>
      ) : platform === "ios" ? (
        <>
          <p className="sub" style={{ margin: 0 }}>
            iOS has no install API — Apple requires the user to do it by hand, and
            grants push only to an app added this way.
          </p>
          <ol className="howto">
            <li>Tap the <b>Share</b> button in Safari&rsquo;s toolbar.</li>
            <li>Scroll and choose <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>, then open the app from its new icon.</li>
          </ol>
          {browser !== "Safari" && (
            <div className="banner warn">
              This only works in <b>Safari</b> on iOS. Other browsers cannot add a web
              app to the Home Screen.
            </div>
          )}
        </>
      ) : deferred ? (
        <>
          <p className="sub" style={{ margin: 0 }}>
            Your browser supports one-click install.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={install}>Install app</button>
          </div>
        </>
      ) : (
        <>
          <p className="sub" style={{ margin: 0 }}>
            No install prompt was offered. Either it is already installed, or this
            browser does not support installing web apps.
          </p>
          <ol className="howto">
            <li>
              Chrome / Edge: the install icon in the address bar, or ⋮ →{" "}
              <b>Install page as app</b>.
            </li>
            <li>Firefox and desktop Safari cannot install web apps.</li>
          </ol>
        </>
      )}

      {outcome === "dismissed" && (
        <div className="banner warn">
          Install dismissed. Reload the page to be offered it again.
        </div>
      )}
    </section>
  );
}
