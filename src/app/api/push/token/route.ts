import { NextResponse } from "next/server";
import { upsertDevice } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The endpoint the SDK's `sync.register` calls.
 *
 * It has to exist before the UI is worth testing: the SDK swallows a failed
 * register so tracking can never break the page, which means a missing
 * endpoint looks exactly like success — "Notifications are on" and an empty
 * database.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const { device, created } = await upsertDevice({
    token,
    appId: (body.appId as string) ?? null,
    platform: (body.platform as string) ?? "unknown",
    browser: (body.browser as string) ?? "unknown",
    swVersion: (body.swVersion as string) ?? null,
    deviceId: (body.deviceId as string) ?? null,
    userId: (body.userId as string) ?? null,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, created, id: device.id });
}
