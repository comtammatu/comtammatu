import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import { TransferReceiveClient } from "./transfer-receive-client";
import { getBranchSiteDisplayName } from "../../../../_lib/branch-site-labels";

export default async function MobileTransferReceivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    redirect("/inventory/m/transfers");
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims || !INVENTORY_OPS_ROLES.includes(claims.user_role)) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const [transferRes, branchesRes] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select(
        "id, transfer_number, status, from_branch_id, to_branch_id, notes, shipped_at",
      )
      .eq("id", id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id),
  ]);

  if (!transferRes.data) redirect("/inventory/m/transfers");

  const linesRes = await supabase
    .from("stock_transfer_items")
    .select(
      "id, ingredient_id, quantity, unit, quantity_received, ingredients ( id, name, unit, purchase_unit )",
    )
    .eq("transfer_id", id)
    .eq("tenant_id", claims.tenant_id);

  const branchName = new Map(
    (branchesRes.data ?? []).map(
      (b) => [b.id, getBranchSiteDisplayName(b)] as const,
    ),
  );

  const lines = (linesRes.data ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
      purchase_unit: string | null;
    } | null;
    return {
      id: l.id,
      ingredientId: l.ingredient_id,
      ingredientName: ing?.name ?? "—",
      unit: l.unit || ing?.purchase_unit || ing?.unit || "",
      sentQty: Number(l.quantity),
      receivedQty: Number(l.quantity_received ?? 0),
    };
  });

  const transfer = transferRes.data;

  return (
    <TransferReceiveClient
      transfer={{
        id: transfer.id,
        code: transfer.transfer_number,
        status: transfer.status,
        fromBranchName: branchName.get(transfer.from_branch_id) ?? "—",
        toBranchName: branchName.get(transfer.to_branch_id) ?? "—",
        notes: transfer.notes,
        shippedAt: transfer.shipped_at,
      }}
      lines={lines}
    />
  );
}
