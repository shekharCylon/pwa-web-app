import { NextResponse } from "next/server";
import { upsertDevice, recordEngageSync } from "@/lib/store";
import { reportDeviceToken } from "@/lib/engage";

export const dynamic = "force-dynamic";

/**
 * The endpoint the browser calls after Firebase hands it a token.
 *
 * Two things happen here, in this order, on purpose:
 *
 *   1. The token is stored locally. This POC's own list is what proves the
 *      browser half works, and it must not depend on Engage being reachable.
 *   2. It is relayed to Engage as an ordinary event. This is the step that
 *      makes the device reachable by a campaign, and it happens HERE rather
 *      than in the browser because it needs the app secret.
 *
 * The Engage outcome is returned rather than swallowed. A token that never
 * arrived looks exactly like one that did — right up until the campaign
 * quietly misses that person — so the client is told, and shows it.
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

  const userAgent = req.headers.get("user-agent");
  const platform = (body.platform as string) ?? "unknown";
  const browser = (body.browser as string) ?? "unknown";
  const deviceId = (body.deviceId as string) ?? null;
  const swVersion = (body.swVersion as string) ?? null;

  const { device, created } = await upsertDevice({
    token,
    appId: (body.appId as string) ?? null,
    platform,
    browser,
    swVersion,
    deviceId,
    userId: (body.userId as string) ?? null,
    userAgent,
    email: (body.email as string) ?? null,
    firstName: (body.firstName as string) ?? null,
    lastName: (body.lastName as string) ?? null,
  });

  const engage = await reportDeviceToken({
    token,
    identity: {
      email: (body.email as string) ?? null,
      firstName: (body.firstName as string) ?? null,
      lastName: (body.lastName as string) ?? null,
    },
    platform,
    browser,
    deviceId,
    swVersion,
    userAgent,
    source: req.headers.get("host"),
  });

  await recordEngageSync(token, engage);

  return NextResponse.json({ ok: true, created, id: device.id, engage });
}
