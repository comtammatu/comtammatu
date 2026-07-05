import { notFound } from "next/navigation";
import {
  fetchUnits,
  type UnitRow,
} from "@/(protected)/inventory/settings/units/units-actions";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogUnitsClient } from "./catalog-units-client";

export default async function OperatorCatalogUnitsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const res = await fetchUnits();
  const rows: UnitRow[] = res.success ? (res.data ?? []) : [];

  return (
    <CatalogUnitsClient backHref={`/br/${branchId}/stock/catalog`} rows={rows} />
  );
}
