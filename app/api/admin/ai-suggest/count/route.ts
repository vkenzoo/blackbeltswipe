import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { countPendingAiDrafts } from "@/lib/queries/ai-drafts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();
  const count = await countPendingAiDrafts();
  return NextResponse.json({ count });
}
