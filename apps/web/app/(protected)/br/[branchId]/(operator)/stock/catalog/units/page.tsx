import { notFound } from "next/navigation";
import {
  fetchUnits,
  type UnitRow,
} from "@/(protected)/inventory/settings/units/units-actions";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogPageShell } from "../catalog-page-shell";
import { CatalogUnitsClient } from "./catalog-units-client";

const copy = messages.catalog.units;

export default function OperatorCatalogUnitsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  return (
    <CatalogPageShell title={copy.title}>
      <CatalogUnitsBody params={params} />
    </CatalogPageShell>
  );
}

async function CatalogUnitsBody({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  if (parseOperatorBranchId(rawBranchId) == null) notFound();

  const res = await fetchUnits();
  const rows: UnitRow[] = res.success ? (res.data ?? []) : [];

  return <CatalogUnitsClient rows={rows} />;
}
