import { NextResponse } from "next/server";
import { describeConnection } from "@/lib/engage";

export const dynamic = "force-dynamic";

/**
 * What this app knows about its Engage connection, for the UI.
 *
 * describeConnection() returns no secret and nothing derived from one — only
 * whether the three variables are set, and the app id truncated. The secret
 * itself never leaves the server, which is the entire reason the relay lives
 * in an API route instead of in the browser.
 */
export async function GET() {
  return NextResponse.json(describeConnection());
}
