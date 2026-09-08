import {
  PERMISSION_KEYS,
  canAccess,
  type StaffRole,
} from "@comtammatu/shared/auth";
import {
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
  LinkCardGrid,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import {
  CATALOG_MANAGE_PERMISSIONS,
  CATALOG_READ_PERMISSIONS,
} from "./_lib/catalog-permissions";
import {
  resolveInventoryNav,
  withInventoryBranchNavScope,
  type InventoryNavFlags,
} from "./_lib/inventory-nav";
import { resolveRequestedBranchId } from "./_lib/inventory-scope";
import {
  countGrnsAwaitingUnitPrice,
  countOpenGrns,
  countOpenStockTransfers,
  countPendingWasteApprovals,
} from "./_lib/receiving-counts";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  PRODUCTION_OPEN_PERMISSIONS,
} from "./production-data";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import { messages } from "@lib/messages";
import {
  settleOperationalCount,
  type OperationalCount,
} from "@lib/inventory/operational-count";
import { InventoryShiftCockpit } from "./_components/inventory-shift-cockpit";

const INVENTORY_SETTINGS_PERMISSIONS = [
  PERMISSION_KEYS.SETTINGS_BRANCH,
  PERMISSION_KEYS.SETTINGS_TENANT,
  PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
] as const;

const copy = messages.inventory.home;

function getLaneDescription(href: string): string {
  if (href.includes("/stocktake")) return copy.laneDescriptions.stocktake;
  if (href.includes("/stock")) return copy.laneDescriptions.stock;
  if (href.includes("/purchase-orders"))
    return copy.laneDescriptions.purchaseOrders;
  if (href.includes("/grn")) return copy.laneDescriptions.receipts;
  if (href.includes("/consumption")) return copy.laneDescriptions.consumption;
  if (href.includes("/transfers")) return copy.laneDescriptions.transfers;
  if (href.includes("/production")) return copy.laneDescriptions.production;
  if (href.includes("/settings")) return copy.laneDescriptions.settings;
  if (href.includes("/suppliers")) return copy.laneDescriptions.suppliers;
  if (href.includes("/ingredients")) return copy.laneDescriptions.ingredients;
  if (href.includes("/menu-recipes")) return copy.laneDescriptions.menuRecipes;
  return copy.laneHint;
}

async function resolveInventoryHomeFlags(
  role: StaffRole,
  auth: Awaited<ReturnType<typeof loadAuthState>>,
): Promise<InventoryNavFlags> {
  const isOwner = role === "owner";
  const canOpenInventory = canAccess(role, "inventory");
  const denied = Promise.resolve(false);
  const granted = Promise.resolve(true);
  const isCentralCatalogViewer =
    role === "central_supply_ops" || role === "central_kitchen_lead";

  const [
    hasProcurementRead,
    canManageCatalog,
    canReadCatalog,
    canOpenInventorySettings,
    hasProductionPermission,
    hasProductionBranchAccess,
  ] = await Promise.all([
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS)
        : denied,
    isOwner
      ? denied
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(CATALOG_READ_PERMISSIONS)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? hasCurrentProductionBranchAccess(auth.supabase, auth.claims)
        : denied,
  ]);

  const showCatalogManagement =
    (isOwner || role === "central_supply_ops") && canManageCatalog;

  return {
    showProcurement: isOwner || hasProcurementRead,
    showProduction:
      isOwner ||
      (canAccessProductionSurface(role) &&
        hasProductionPermission &&
        hasProductionBranchAccess),
    showCatalogManagement,
    showCatalogRead:
      !showCatalogManagement && isCentralCatalogViewer && canReadCatalog,
    showSettings: isOwner || canOpenInventorySettings,
    showStockRequestInbox:
      role === "owner" ||
      role === "central_supply_ops" ||
      role === "central_kitchen_lead",
  };
}

function scopeHref(href: string, branchId: number | null): string {
  if (branchId == null) return href;
  return withControlSurfaceBranchScope(href, String(branchId) as `${number}`, {
    prefixes: ["/inventory"],
  });
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const auth = await loadAuthState();
  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branch);
  const flags = await resolveInventoryHomeFlags(auth.claims.user_role, auth);
  const groups = withInventoryBranchNavScope(
    resolveInventoryNav({
      userRole: auth.claims.user_role,
      ...flags,
    }),
    branchId,
    { scopeAll: params.branch === "all" },
  );

  const [grnCount, grnPriceCount, wasteCount, transferCount] =
    await Promise.all([
      flags.showProcurement
        ? settleOperationalCount(() => countOpenGrns(branchId ?? undefined))
        : Promise.resolve<OperationalCount>({ status: "forbidden" }),
      flags.showProcurement
        ? settleOperationalCount(() =>
            countGrnsAwaitingUnitPrice(branchId ?? undefined),
          )
        : Promise.resolve<OperationalCount>({ status: "forbidden" }),
      settleOperationalCount(() =>
        countPendingWasteApprovals(branchId ?? undefined),
      ),
      flags.showStockRequestInbox
        ? settleOperationalCount(() =>
            countOpenStockTransfers(branchId ?? undefined),
          )
        : Promise.resolve<OperationalCount>({ status: "forbidden" }),
    ]);

  const attentionItems = [
    {
      id: "grn",
      label: copy.attentionGrn,
      result: grnCount,
      href: scopeHref("/inventory/grn", branchId),
    },
    {
      id: "grn-price",
      label: copy.attentionGrnPrice,
      result: grnPriceCount,
      href: scopeHref("/inventory/grn", branchId),
    },
    {
      id: "transfers",
      label: copy.attentionTransfers,
      result: transferCount,
      href: scopeHref("/inventory/transfers?work=dispatch", branchId),
    },
    {
      id: "waste",
      label: copy.attentionWaste,
      result: wasteCount,
      href: scopeHref("/inventory/waste/approvals", branchId),
    },
  ];

  return (
    <AppPage density="compact" width="wide">
      <AppPageHeader title={copy.title} />
      <InventoryShiftCockpit
        branchId={branchId}
        scopeAll={params.branch === "all"}
        title={copy.attentionTitle}
        items={attentionItems}
        canAccessProduction={flags.showProduction}
        canAccessStock={groups.some((group) =>
          group.items.some((item) => item.href === "/inventory/stock"),
        )}
      />
      <div className="grid items-start gap-3">
        {groups.map((group) => {
          const isCatalog = group.title.includes("Danh mục");
          return (
            <AppSection key={group.title} title={group.title} headingLevel="h2">
              <LinkCardGrid
                className={
                  isCatalog ? undefined : "sm:grid-cols-2 xl:grid-cols-3"
                }
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <AppLinkCard
                      key={item.href}
                      href={item.linkHref ?? item.href}
                      title={item.label}
                      description={getLaneDescription(item.href)}
                      icon={<Icon aria-hidden="true" />}
                    />
                  );
                })}
              </LinkCardGrid>
            </AppSection>
          );
        })}
      </div>
    </AppPage>
  );
}
