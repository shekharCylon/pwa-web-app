import { NextResponse } from "next/server";
import { disableDevice } from "@/lib/store";
import { reportOptOut } from "@/lib/engage";

/**
 * Opt-out. Told to Engage too, or the device stays in every future audience
 * and the person keeps being notified after asking not to be.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = body.token ?? null;
    const n = await disableDevice(token, body.deviceId ?? null);
    if (token) await reportOptOut(token);
    return NextResponse.json({ ok: true, disabled: n });
  } catch {
    return NextResponse.json({ ok: true, disabled: 0 });
  }
}
