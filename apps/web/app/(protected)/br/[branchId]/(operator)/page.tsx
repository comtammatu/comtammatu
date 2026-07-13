import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Menu as IconMenu } from "lucide-react";
import {
  MODULE_ACL,
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { getTodayWorkState } from "@lib/staff-runtime/_lib/today-work-state";
import { messages } from "@lib/messages";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { parseOperatorBranchId } from "../_lib/parse-branch-id";
import {
  getBranchHomeTileLimit,
  getBranchPrimaryHomeGroup,
  getOperatorHomeTileHrefs,
} from "./_lib/operator-home-contract";
import { resolveOperatorTileIcon } from "./operator-tile-icons";

import { HubQueueSection } from "./_components/hub/hub-queue-section";
import { HubTodayStatus } from "./_components/hub/hub-today-status";
import {
  HubTodayStatusPending,
  HubQueuePending,
} from "./_components/hub/hub-skeletons";

const homeCopy = messages.operator.home;

export default async function OperatorHomePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const authState = await loadAuthState();
  const { supabase, claims } = authState;
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const branchKind = context.branch.branch_kind as BranchKind;
  const rawGroups = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    branchKind,
  );
  // Pre-clock-in gate for cashier/chef roles
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";

  const workState = await getTodayWorkState();
  const beforeClockIn = workState?.status === "not_started";

  // Pre-clock-in tiles stay visible so the operator understands what unlocks.
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  const isBranchManagerOrOwner =
    claims.user_role === "branch_manager" || claims.user_role === "owner";

  const branchTodayGroup = getBranchPrimaryHomeGroup(rawGroups);
  const branchTodayTileLimit = branchTodayGroup
    ? getBranchHomeTileLimit(branchTodayGroup.id)
    : 0;

  const groups = isBranchManagerOrOwner
    ? (() => {
        const managerHomeHrefs = getOperatorHomeTileHrefs(
          rawGroups,
          claims.user_role,
        );
        return rawGroups
          .map((group) => ({
            ...group,
            tiles: group.tiles.filter((tile) =>
              managerHomeHrefs.has(tile.href),
            ),
          }))
          .filter((group) => group.tiles.length > 0);
      })()
    : branchTodayGroup
      ? [
          {
            ...branchTodayGroup,
            tiles: branchTodayGroup.tiles.slice(0, branchTodayTileLimit),
          },
        ].filter((group) => group.tiles.length > 0)
      : [];

  const branchManagementLinks = isBranchManagerOrOwner
    ? [
        {
          key: "branch-menu-limits",
          href: `/br/${context.branchId}/menu-limits`,
          icon: resolveOperatorTileIcon("Utensils"),
          title: MODULE_ACL.branch_menu_limits.label,
        },
        {
          key: "branch-settings",
          href: `/br/${context.branchId}/settings`,
          icon: resolveOperatorTileIcon("Settings"),
          title: MODULE_ACL.branch_settings.label,
        },
        {
          key: "branch-pos-sessions",
          href: `/br/${context.branchId}/pos-sessions`,
          icon: resolveOperatorTileIcon("Clock"),
          title: MODULE_ACL.branch_pos_sessions.label,
        },
      ]
    : [];

  const toolGroups = [
    ...groups.map((group) => ({
      key: group.id,
      title: group.title,
      links: group.tiles.map((tile) => ({
        key: `${group.id}-${tile.moduleKey}-${tile.href}`,
        href: tile.href,
        icon: resolveOperatorTileIcon(tile.icon),
        title: tile.label,
        disabled: tilesLockedBeforeClockIn && group.id === "sales_kitchen",
      })),
    })),
    {
      key: "branch-management",
      title: APP_COPY_VI.operatorOpsActions,
      links: branchManagementLinks.map((link) => ({
        ...link,
        disabled: false,
      })),
    },
  ].filter((group) => group.links.length > 0);

  return (
    <BranchOperatorPage
      title={APP_COPY_VI.operatorHome}
      action={
        toolGroups.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="touch">
                <IconMenu />
                <span className="hidden sm:inline">{homeCopy.toolsMenu}</span>
                <span className="sr-only sm:hidden">{homeCopy.toolsMenu}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {toolGroups.map((group, groupIndex) => (
                <div key={group.key}>
                  {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
                  {group.links.map((item) =>
                    item.disabled ? (
                      <DropdownMenuItem
                        key={item.key}
                        disabled
                        className="min-h-11"
                      >
                        <item.icon />
                        {item.title}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        key={item.key}
                        asChild
                        className="min-h-11"
                      >
                        <Link href={item.href}>
                          <item.icon />
                          {item.title}
                        </Link>
                      </DropdownMenuItem>
                    ),
                  )}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      {claims.user_role !== "owner" ? (
        <Suspense fallback={<HubTodayStatusPending />}>
          <HubTodayStatus branchId={context.branchId} />
        </Suspense>
      ) : null}

      <Suspense fallback={<HubQueuePending />}>
        <HubQueueSection branchId={context.branchId} />
      </Suspense>
    </BranchOperatorPage>
  );
}
