import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardCheck,
  ClipboardList,
  Package,
  Plus as IconPlus,
  Trash2,
} from "lucide-react";
import {
  resolveOperatorTiles,
  type BranchKind,
  type ResolvedOperatorTile,
} from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadStockFulfillmentRows } from "@lib/inventory/stock-fulfillment-data";
import type { StockFulfillmentSiteKind } from "@lib/inventory/stock-fulfillment-projection";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { resolveOperatorTileIcon } from "../operator-tile-icons";
import { BranchStockFulfillmentHubClient } from "./transfer/branch-stock-fulfillment-hub-client";

interface OperatorStockLink {
  key: string;
  href: string;
  icon: ReturnType<typeof resolveOperatorTileIcon>;
  title: string;
  description?: string;
}

const stockCopy = messages.inventory.dashboard;
const journeyCopy = messages.inventory.stockRequests.journey;

type CentralStockGroupId = "lookup" | "buy_count" | "waste";

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
    "/inventory/production",
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

function BranchStockDoors({ basePath }: { basePath: string }) {
  const doors = [
    {
      key: "on-hand",
      href: `${basePath}/stock/on-hand`,
      icon: Package,
      title: stockCopy.branchDoorOnHand,
      meta: stockCopy.branchDoorOnHandMeta,
    },
    {
      key: "request",
      href: `${basePath}/stock/requests/new`,
      icon: ClipboardList,
      title: stockCopy.branchDoorRequest,
      meta: stockCopy.branchDoorRequestMeta,
    },
    {
      key: "stocktake",
      href: `${basePath}/stock/stocktake`,
      icon: ClipboardCheck,
      title: stockCopy.branchDoorStocktake,
      meta: stockCopy.branchDoorStocktakeMeta,
    },
    {
      key: "waste",
      href: `${basePath}/stock/waste`,
      icon: Trash2,
      title: stockCopy.branchDoorWaste,
      meta: stockCopy.branchDoorWasteMeta,
    },
  ] as const;

  return (
    <BranchOperatorPanel
      title={stockCopy.branchDoorsTitle}
      icon={Package}
      size="sm"
      headingLevel="h2"
    >
      {/* Plain grid — ItemGroup is flex-col and fights grid-cols-2. */}
      <div className="grid grid-cols-2 gap-2">
        {doors.map((door) => (
          <Item
            key={door.key}
            variant="outline"
            size="sm"
            className="chrome-tap min-h-14 select-none bg-card transition-transform motion-safe:active:scale-[0.97]"
            render={<Link href={door.href} />}
          >
            <ItemMedia variant="icon" className="rounded-md bg-muted p-2">
              <door.icon />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle size="heading" className="line-clamp-none text-sm">
                {door.title}
              </ItemTitle>
              <ItemDescription className="line-clamp-2 text-xs">
                {door.meta}
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </div>
    </BranchOperatorPanel>
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

  if (branchKind === "branch") {
    const rows = await loadStockFulfillmentRows({
      supabase,
      tenantId: claims.tenant_id,
      mode: "branch",
      branchId: context.branchId,
      scopeSiteKind: "branch" as StockFulfillmentSiteKind,
      seeAllSources: claims.user_role === "owner",
    }).catch((error: unknown) => {
      console.error("inventory.stock_landing.work_load_failed", error);
      return [];
    });

    const createAction = (
      <Button
        size="touch"
        render={<Link href={`${stockRoot}/requests/new`} />}
      >
        <IconPlus data-icon="inline-start" />
        {journeyCopy.requestAction}
      </Button>
    );

    return (
      <BranchOperatorPage
        title={journeyCopy.hubTitle}
        description={journeyCopy.branchHubDescription}
        hideHeaderOnMobile
        action={<div className="max-sm:hidden">{createAction}</div>}
      >
        <div className="flex min-w-0 flex-col gap-4 pb-[5rem] sm:pb-0">
          <BranchStockDoors basePath={basePath} />
          <BranchStockFulfillmentHubClient
            rows={rows}
            mode="branch"
            branchId={context.branchId}
          />
        </div>
        <AppDetailFooter sticky className="sm:hidden" trailing={createAction} />
      </BranchOperatorPage>
    );
  }

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
