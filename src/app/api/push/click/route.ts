import { NextResponse } from "next/server";
import { recordClick } from "@/lib/store";

/** The worker posts here from notificationclick. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await recordClick(body.token);
  } catch {
    /* a lost click must never surface as an error */
  }
  return NextResponse.json({ ok: true });
}
