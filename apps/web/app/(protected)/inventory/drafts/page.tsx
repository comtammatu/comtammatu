import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  canAccess,
  extractClaimsFromAccessToken,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { listMyGrnDrafts } from "../grn-actions";
import { MobileDraftsClient, type ServerDraftRow } from "./page-client";

export default async function DraftsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (
    !claims ||
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  // Sprint 6 #3: server-side draft list (replaces localStorage listDrafts).
  const res = await listMyGrnDrafts();
  const rows = (res.success ? (res.data ?? []) : []) as Array<{
    id: number;
    supplier_id: number;
    grn_number: string;
    updated_at: string;
    suppliers: { id: number; name: string } | null;
    grn_items: Array<{ id: number }> | null;
  }>;

  const drafts: ServerDraftRow[] = rows.map((row) => ({
    grnId: row.id,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.name ?? "—",
    grnNumber: row.grn_number,
    updatedAt: row.updated_at,
    lineCount: row.grn_items?.length ?? 0,
  }));

  return <MobileDraftsClient drafts={drafts} />;
}
