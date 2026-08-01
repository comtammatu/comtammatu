import { notFound } from "next/navigation";
import {
  resolveOperatorTiles,
  type BranchKind,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadStockOnHandPageData } from "@lib/inventory/stock-on-hand-data";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import {
  BranchStockOnHandClient,
  type StockSecondaryJob,
} from "./branch-stock-on-hand-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

/** Bottom-nav primary jobs — keep out of on-hand “Thêm chức năng” sheet. */
const CENTRAL_PRIMARY_SUFFIXES: Partial<Record<BranchKind, readonly string[]>> =
  {
    central_supply: [
      "/stock/on-hand",
      "/stock/grn",
      "/stock/transfer",
      "/stock/requests",
      "/stock/receive",
    ],
    central_kitchen: [
      "/stock/grn",
      "/stock/production",
      "/stock/transfer",
      "/stock/requests",
      "/stock/receive",
    ],
  };

function resolveSecondaryJobs({
  role,
  branchId,
  branchKind,
}: {
  role: StaffRole;
  branchId: number;
  branchKind: BranchKind;
}): StockSecondaryJob[] {
  const stockRoot = `/br/${branchId}/stock`;
  const stockGroup = resolveOperatorTiles(role, branchId, branchKind).find(
    (group) => group.id === "stock",
  );
  // Always hide the current list; also hide Bottom-Nav primaries for central.
  const exclude = [
    "/stock/on-hand",
    ...(CENTRAL_PRIMARY_SUFFIXES[branchKind] ?? []),
  ];

  const jobs: StockSecondaryJob[] = [];
  for (const tile of stockGroup?.tiles ?? []) {
    const href =
      tile.href === stockRoot ? `${stockRoot}/on-hand` : tile.href;
    if (exclude.some((suffix) => href.endsWith(suffix))) continue;
    jobs.push({
      key: `${tile.moduleKey}-${href}`,
      href,
      title:
        tile.href === stockRoot
          ? messages.inventory.dashboard.viewStockAction
          : tile.label,
    });
  }

  // Hub overflow for any remaining jobs.
  if (!jobs.some((job) => job.href === stockRoot)) {
    jobs.push({
      key: "stock-hub",
      href: stockRoot,
      title: messages.inventory.shell.moduleName,
    });
  }

  return jobs;
}

export default async function OperatorStockOnHandPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const branchKind = context.branch.branch_kind as BranchKind;
  const data = await loadStockOnHandPageData({
    routeBranchId: branchId,
    includeValuation: false,
  });

  return (
    <BranchStockOnHandClient
      branchId={data.branchId}
      branchKind={branchKind}
      permissions={data.permissions}
      coreDataLoadFailed={data.coreDataLoadFailed}
      ingredients={data.ingredients}
      underThresholdCount={data.summary.underThresholdCount}
      secondaryJobs={resolveSecondaryJobs({
        role: claims.user_role,
        branchId: data.branchId,
        branchKind,
      })}
    />
  );
}
