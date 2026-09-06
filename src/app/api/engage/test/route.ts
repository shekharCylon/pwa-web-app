import { NextResponse } from "next/server";
import { testConnection } from "@/lib/engage";

export const dynamic = "force-dynamic";

/**
 * "Is this thing on?" — run from the server, where the credentials are.
 *
 * Writes nothing to Engage. See testConnection() for why an event with no
 * email is the safe way to prove both reachability and credentials at once.
 */
export async function POST() {
  return NextResponse.json(await testConnection());
}
