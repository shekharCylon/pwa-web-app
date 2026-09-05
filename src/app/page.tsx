"use client";

import { useCallback, useState } from "react";
import InstallCard from "@/components/InstallCard";
import PushCard from "@/components/PushCard";
import DeviceList from "@/components/DeviceList";
import Diagnostics from "@/components/Diagnostics";

export default function Home() {
  const [reloadKey, setReloadKey] = useState(0);
  const bump = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <main className="wrap">
      <header className="top">
        <h1>Push token capture</h1>
        <p>
          Install this app on a desktop, an Android phone or an iPhone, turn on
          notifications, and watch the token arrive on the server.
        </p>
      </header>

      <InstallCard onInstalled={bump} />
      <PushCard onCaptured={bump} />
      <DeviceList reloadKey={reloadKey} />
      <Diagnostics />

      <p style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 22, lineHeight: 1.6 }}>
        Testing on a phone needs HTTPS — a LAN address will not do. Run{" "}
        <code className="mono">npx cloudflared tunnel --url http://localhost:3020</code>{" "}
        and open the https URL it prints.
      </p>
    </main>
  );
}
