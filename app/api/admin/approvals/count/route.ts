/**
 * GET /api/admin/approvals/count
 *
 * Retorna contagem de pages ad_library em quarentena (verified_for_sync=false).
 * Usado pro badge de notificação no sidebar.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { countPendingApprovals } from "@/lib/queries/pending-approvals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await requireAdmin();
  const count = await countPendingApprovals();
  return NextResponse.json({ count });
}
