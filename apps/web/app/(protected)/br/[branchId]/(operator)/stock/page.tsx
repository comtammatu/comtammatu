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
  description?: string;
}

const stockCopy = messages.inventory.dashboard;

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

const STOCK_JOB_DESCRIPTION_BY_SUFFIX: ReadonlyArray<{
  suffix: string;
  description: string;
}> = [
  { suffix: "/stock/on-hand", description: stockCopy.stockJobOnHand },
  { suffix: "/stock/requests", description: stockCopy.stockJobRequests },
  { suffix: "/stock/receive", description: stockCopy.stockJobReceive },
  { suffix: "/stock/transfer", description: stockCopy.stockJobTransfer },
  { suffix: "/stock/stocktake", description: stockCopy.stockJobStocktake },
  {
    suffix: "/stock/count-assignments",
    description: stockCopy.stockJobCountAssignments,
  },
  { suffix: "/stock/count-slips", description: stockCopy.stockJobCountSlips },
  { suffix: "/stock/waste", description: stockCopy.stockJobWaste },
  { suffix: "/stock/consumption", description: stockCopy.stockJobConsumption },
  { suffix: "/stock/catalog", description: stockCopy.stockJobCatalog },
  {
    suffix: "/stock/purchase-requests",
    description: stockCopy.stockJobPurchaseRequests,
  },
];

function stockJobDescription(href: string): string | undefined {
  return STOCK_JOB_DESCRIPTION_BY_SUFFIX.find(({ suffix }) =>
    href.endsWith(suffix),
  )?.description;
}

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
    description: stockJobDescription(href),
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

function StockWorkflowSections({
  sections,
}: {
  sections: ReadonlyArray<{
    id: string;
    title: string;
    description: string;
    links: OperatorStockLink[];
    primary?: boolean;
  }>;
}) {
  const visible = sections.filter((section) => section.links.length > 0);
  if (visible.length === 0) {
    return (
      <AppEmptyState
        compact
        title={messages.inventory.dashboard.noUrgentTasks}
        symbol="riceGrain"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {visible.map((section) => (
        <BranchOperatorActionSection
          key={section.id}
          title={section.title}
          description={section.description}
          links={section.links}
          columns={2}
          mobileColumns={2}
          wideColumns
          presentation={section.primary ? "stations" : "plain"}
        />
      ))}
    </div>
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

    return (
      <BranchOperatorPage
        title={stockGroup?.title ?? messages.inventory.shell.moduleName}
        description={messages.inventory.dashboard.mainFlowsOperatorDescription}
        hideHeaderOnMobile
      >
        {links.length > 0 ? (
          <StockWorkflowSections
            sections={[
              {
                id: "lookup",
                title: stockCopy.stockFlowLookupTitle,
                description: stockCopy.stockFlowLookupDescription,
                links: groupedLinks.lookup,
                primary: true,
              },
              {
                id: "buy_count",
                title: stockCopy.stockFlowBuyCountTitle,
                description: stockCopy.stockFlowBuyCountDescription,
                links: groupedLinks.buy_count,
              },
              {
                id: "waste",
                title: stockCopy.stockFlowWasteTitle,
                description: stockCopy.stockFlowWasteDescription,
                links: groupedLinks.waste,
              },
            ]}
          />
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

  return (
    <BranchOperatorPage
      title={stockGroup?.title ?? messages.inventory.shell.moduleName}
      description={messages.inventory.dashboard.mainFlowsOperatorDescription}
      hideHeaderOnMobile
    >
      {links.length > 0 ? (
        <StockWorkflowSections
          sections={[
            {
              id: "onhand",
              title: stockCopy.stockFlowDailyTitle,
              description: stockCopy.stockFlowDailyDescription,
              links: groupedLinks.onhand,
              primary: true,
            },
            {
              id: "count",
              title: stockCopy.stockFlowCountTitle,
              description: stockCopy.stockFlowCountDescription,
              links: groupedLinks.count,
            },
            {
              id: "waste",
              title: stockCopy.stockFlowWasteTitle,
              description: stockCopy.stockFlowWasteDescription,
              links: groupedLinks.waste,
            },
            {
              id: "catalog",
              title: stockCopy.stockFlowCatalogTitle,
              description: stockCopy.stockFlowCatalogDescription,
              links: groupedLinks.catalog,
            },
          ]}
        />
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
