import { NextResponse } from "next/server";
import { recordClick } from "@/lib/store";
import { reportClick } from "@/lib/engage";

/**
 * The worker posts here from notificationclick.
 *
 * Relayed to Engage as well, because a click is one of only two signals web
 * push produces. The other is "the push service accepted it", which is not
 * delivery — there is no delivery receipt and no open rate anywhere in this
 * channel, so losing clicks means losing half of everything you can know.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : null;
    await recordClick(token ?? undefined);
    if (token) {
      // Awaited, not fired and forgotten: a serverless function can be frozen
      // the moment it responds, and an un-awaited fetch is simply lost.
      await reportClick(token, body.link ?? null);
    }
  } catch {
    /* a lost click must never surface as an error to the person who clicked */
  }
  return NextResponse.json({ ok: true });
}
