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

type BranchStockGroupId = "onhand" | "count" | "waste" | "catalog";
type CentralStockGroupId = "lookup" | "buy_count" | "waste";

const BRANCH_STOCK_TAB_SUFFIXES: Record<
  BranchStockGroupId,
  readonly string[]
> = {
  onhand: [
    "/stock/on-hand",
    "/stock/requests",
    "/stock/receive",
    "/stock/transfer",
  ],
  count: ["/stock/stocktake", "/stock/count-assignments", "/stock/count-slips"],
  waste: ["/stock/waste", "/stock/consumption"],
  catalog: ["/stock/catalog"],
};

const CENTRAL_STOCK_TAB_SUFFIXES: Record<
  CentralStockGroupId,
  readonly string[]
> = {
  lookup: ["/stock/on-hand", "/stock/catalog"],
  buy_count: [
    "/stock/purchase-requests",
    "/stock/stocktake",
    "/stock/count-assignments",
    "/stock/count-slips",
  ],
  waste: ["/stock/waste", "/stock/consumption"],
};

/** Jobs already on central Bottom-Nav — exclude from Thêm hub. */
const CENTRAL_BOTTOM_NAV_SUFFIXES: Partial<
  Record<BranchKind, readonly string[]>
> = {
  central_supply: [
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

function isCentralKind(branchKind: BranchKind): boolean {
  return branchKind === "central_supply" || branchKind === "central_kitchen";
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
  const allLinks =
    stockGroup?.tiles.map((tile) => toOperatorStockLink(tile, stockRoot)) ?? [];

  const excludeSuffixes = CENTRAL_BOTTOM_NAV_SUFFIXES[branchKind] ?? [];
  const links = isCentralKind(branchKind)
    ? allLinks.filter(
        (link) =>
          !excludeSuffixes.some((suffix) => link.href.endsWith(suffix)),
      )
    : allLinks;

  if (isCentralKind(branchKind)) {
    const groupedLinks: Record<CentralStockGroupId, OperatorStockLink[]> = {
      lookup: pickStockLinks(links, CENTRAL_STOCK_TAB_SUFFIXES.lookup),
      buy_count: pickStockLinks(links, CENTRAL_STOCK_TAB_SUFFIXES.buy_count),
      waste: pickStockLinks(links, CENTRAL_STOCK_TAB_SUFFIXES.waste),
    };
    const usedKeys = new Set(
      Object.values(groupedLinks)
        .flat()
        .map((link) => link.key),
    );
    const fallbackLinks = links.filter((link) => !usedKeys.has(link.key));
    if (fallbackLinks.length > 0) {
      groupedLinks.lookup = [...groupedLinks.lookup, ...fallbackLinks];
    }

    const tabs = (
      [
        { id: "lookup" as const, label: stockTab.stockTabOnhand },
        { id: "buy_count" as const, label: stockTab.stockTabCount },
        { id: "waste" as const, label: stockTab.stockTabWaste },
      ] as const
    ).filter((tab) => groupedLinks[tab.id].length > 0);

    return (
      <BranchOperatorPage
        title={stockGroup?.title ?? messages.inventory.shell.moduleName}
        description={messages.inventory.dashboard.mainFlowsOperatorDescription}
        hideHeaderOnMobile
      >
        {links.length > 0 && tabs.length > 0 ? (
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

  const groupedLinks: Record<BranchStockGroupId, OperatorStockLink[]> = {
    onhand: pickStockLinks(links, BRANCH_STOCK_TAB_SUFFIXES.onhand),
    count: pickStockLinks(links, BRANCH_STOCK_TAB_SUFFIXES.count),
    waste: pickStockLinks(links, BRANCH_STOCK_TAB_SUFFIXES.waste),
    catalog: pickStockLinks(links, BRANCH_STOCK_TAB_SUFFIXES.catalog),
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

  const tabs = (
    [
      { id: "onhand" as const, label: stockTab.stockTabOnhand },
      { id: "count" as const, label: stockTab.stockTabCount },
      { id: "waste" as const, label: stockTab.stockTabWaste },
      { id: "catalog" as const, label: stockTab.stockTabCatalog },
    ] as const
  ).filter((tab) => groupedLinks[tab.id].length > 0);

  return (
    <BranchOperatorPage
      title={stockGroup?.title ?? messages.inventory.shell.moduleName}
      description={messages.inventory.dashboard.mainFlowsOperatorDescription}
      hideHeaderOnMobile
    >
      {links.length > 0 && tabs.length > 0 ? (
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
