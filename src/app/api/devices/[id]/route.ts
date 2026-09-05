import { NextResponse } from "next/server";
import { deleteDevice } from "@/lib/store";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteDevice(id);
  return NextResponse.json({ deleted: ok }, { status: ok ? 200 : 404 });
}
