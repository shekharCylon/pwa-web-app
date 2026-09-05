import { NextResponse } from "next/server";
import { listDevices } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ devices: await listDevices() });
}
