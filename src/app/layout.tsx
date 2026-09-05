import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Push Token Capture",
  description: "Install the app, grant notifications, and capture the device token.",
  manifest: "/manifest.json",
  // Without this iOS opens the app in a Safari chrome rather than standalone,
  // and standalone is what Apple requires before granting push.
  appleWebApp: {
    capable: true,
    title: "Push POC",
    statusBarStyle: "black-translucent",
  },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
