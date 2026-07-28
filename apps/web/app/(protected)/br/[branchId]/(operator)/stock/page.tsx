import { notFound } from "next/navigation";
import {
  resolveOperatorTiles,
  type BranchKind,
  type ResolvedOperatorTile,
} from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
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

const stockTab = messages.inventory.dashboard;

type StockGroupId = "onhand" | "count" | "waste" | "catalog";

const STOCK_TAB_SUFFIXES: Record<StockGroupId, readonly string[]> = {
  onhand: ["/stock/on-hand", "/stock/grn", "/stock/production"],
  count: ["/stock/stocktake", "/stock/count-assignments", "/stock/count-slips"],
  waste: ["/stock/waste", "/stock/consumption"],
  catalog: ["/stock/catalog"],
};

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
): OperatorStockLink[] {
  return suffixes.flatMap((suffix) =>
    links.filter((link) => link.href.endsWith(suffix)),
  );
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

  const groupedLinks: Record<StockGroupId, OperatorStockLink[]> = {
    onhand: pickStockLinks(links, STOCK_TAB_SUFFIXES.onhand),
    count: pickStockLinks(links, STOCK_TAB_SUFFIXES.count),
    waste: pickStockLinks(links, STOCK_TAB_SUFFIXES.waste),
    catalog: pickStockLinks(links, STOCK_TAB_SUFFIXES.catalog),
  };
  const usedKeys = new Set(
    Object.values(groupedLinks)
      .flat()
      .map((link) => link.key),
  );
  const fallbackLinks = links.filter((link) => !usedKeys.has(link.key));
  if (fallbackLinks.length > 0) {
    groupedLinks.onhand = [...groupedLinks.onhand, ...fallbackLinks];
  }
  const hasLinks = links.length > 0;

  const tabs = (
    [
      { id: "onhand", label: stockTab.stockTabOnhand },
      { id: "count", label: stockTab.stockTabCount },
      { id: "waste", label: stockTab.stockTabWaste },
      { id: "catalog", label: stockTab.stockTabCatalog },
    ] as const
  ).filter((tab) => groupedLinks[tab.id].length > 0);

  return (
    <BranchOperatorPage
      title={stockGroup?.title ?? messages.inventory.shell.moduleName}
      description={messages.inventory.dashboard.mainFlowsOperatorDescription}
      hideHeaderOnMobile
    >
      {hasLinks && tabs.length > 0 ? (
        <AppPageTabs
          paramKey="group"
          defaultValue={tabs[0]?.id}
          ariaLabel={stockTab.stockTabsAriaLabel}
          items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
        >
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <BranchOperatorActionSection
                links={groupedLinks[tab.id]}
                columns={2}
                mobileColumns={2}
                wideColumns
              />
            </TabsContent>
          ))}
        </AppPageTabs>
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
