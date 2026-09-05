import { NextResponse } from "next/server";
import { disableDevice } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const n = await disableDevice(body.token ?? null, body.deviceId ?? null);
    return NextResponse.json({ ok: true, disabled: n });
  } catch {
    return NextResponse.json({ ok: true, disabled: 0 });
  }
}
