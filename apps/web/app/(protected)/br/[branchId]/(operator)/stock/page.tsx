import { notFound } from "next/navigation";
import {
  resolveOperatorTiles,
  type BranchKind,
  type ResolvedOperatorTile,
} from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { resolveOperatorTileIcon } from "../operator-tile-icons";

interface OperatorStockLink {
  key: string;
  href: string;
  icon: ReturnType<typeof resolveOperatorTileIcon>;
  title: string;
}

const STOCK_PRIMARY_SUFFIXES = [
  "/stock/on-hand",
  "/stock/grn",
  "/stock/production",
] as const;

const STOCK_SECONDARY_SUFFIXES = [
  "/stock/stocktake",
  "/stock/waste",
  "/stock/count-assignments",
  "/stock/consumption",
  "/stock/catalog",
] as const;

function toOperatorStockLink(
  tile: ResolvedOperatorTile,
  stockRoot: string,
): OperatorStockLink {
  const href = tile.href === stockRoot ? `${stockRoot}/on-hand` : tile.href;
  return {
    key: `${tile.moduleKey}-${tile.href}`,
    href,
    icon: resolveOperatorTileIcon(tile.icon),
    title:
      tile.href === stockRoot
        ? messages.inventory.dashboard.viewStockAction
        : tile.label,
  };
}

function pickStockLinks(
  links: OperatorStockLink[],
  suffixes: readonly string[],
  used: Set<string>,
): OperatorStockLink[] {
  const picked = suffixes.flatMap((suffix) =>
    links.filter((link) => !used.has(link.key) && link.href.endsWith(suffix)),
  );
  for (const link of picked) used.add(link.key);
  return picked;
}

export default async function OperatorStockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const branchKind = context.branch.branch_kind as BranchKind;
  const basePath = `/br/${context.branchId}`;
  const stockRoot = `${basePath}/stock`;
  const stockGroup = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    branchKind,
  ).find((group) => group.id === "stock");
  const links =
    stockGroup?.tiles.map((tile) => toOperatorStockLink(tile, stockRoot)) ?? [];
  const usedLinks = new Set<string>();
  const primaryLinks = pickStockLinks(links, STOCK_PRIMARY_SUFFIXES, usedLinks);
  const secondaryLinks = pickStockLinks(
    links,
    STOCK_SECONDARY_SUFFIXES,
    usedLinks,
  );
  const fallbackLinks = links.filter((link) => !usedLinks.has(link.key));
  const hasLinks = links.length > 0;

  return (
    <BranchOperatorPage
      title={stockGroup?.title ?? messages.inventory.shell.moduleName}
      description={messages.inventory.dashboard.mainFlowsOperatorDescription}
      hideHeaderOnMobile
    >
      {hasLinks ? (
        <>
          <BranchOperatorActionSection
            title={messages.inventory.dashboard.operatorStockPrimaryTitle}
            links={primaryLinks}
            columns={2}
            mobileColumns={2}
            wideColumns
          />

          <BranchOperatorActionSection
            title={messages.inventory.dashboard.operatorStockSecondaryTitle}
            links={[...secondaryLinks, ...fallbackLinks]}
            columns={2}
            mobileColumns={2}
            wideColumns
            tone="info"
          />
        </>
      ) : (
        <AppEmptyState
          compact
          title={messages.inventory.dashboard.noUrgentTasks}
          symbol="riceGrain"
        />
      )}
    </BranchOperatorPage>
  );
}
