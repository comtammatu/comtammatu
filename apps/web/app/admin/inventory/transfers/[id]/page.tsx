import { notFound } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchIngredients } from "../../actions";
import {
  fetchStockTransferDetail,
  resolveHeadquartersBranchId,
} from "../../transfer-actions";
import { TransferDetailClient } from "./transfer-detail-client";
import type { IngredientRow } from "../../page";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const [detail, hqBranchId, ingRes, branchesRes] = await Promise.all([
    fetchStockTransferDetail(num),
    resolveHeadquartersBranchId(),
    fetchIngredients(),
    claims
      ? supabase
          .from("branches")
          .select("id, name")
          .eq("tenant_id", claims.tenant_id)
      : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  ]);
  if (!detail.success || !detail.data) notFound();

  const { transfer, lines } = detail.data as {
    transfer: { from_branch_id: number; to_branch_id: number };
    lines: unknown[];
  };
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  const branchNameMap = Object.fromEntries(
    (
      (branchesRes as { data: { id: number; name: string }[] | null }).data ??
      []
    ).map((b) => [b.id, b.name] as const),
  );

  return (
    <TransferDetailClient
      transferId={num}
      initialTransfer={transfer as never}
      initialLines={lines as never}
      ingredients={ingredients}
      hqBranchId={hqBranchId}
      branchNames={branchNameMap}
    />
  );
}
