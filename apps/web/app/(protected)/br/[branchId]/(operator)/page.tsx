import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  canAccess,
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
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

import { BranchQueueSection } from "./_components/home/branch-queue-section";
import { BranchTodayStatus } from "./_components/home/branch-today-status";
import { BranchTodayStatusPending, BranchQueuePending } from "./_components/home/branch-home-skeletons";
import { BranchQuickMenuLimitTrigger } from "./_components/home/branch-quick-menu-limit-trigger";
import { BranchRevenueTargetStrip } from "./_components/home/branch-revenue-target-strip";
import { fetchBranchRevenueTargetProgress } from "@/(protected)/finance/targets/actions";

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
  // R04: central sites use Control home `/` — not a second daily hub on /br.
  if (branchKind !== "branch") {
    redirect("/");
  }

  const rawGroups = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    branchKind,
  );
  // Pre-clock-in gate for floor operators (includes waiter → branch_staff).
  const isFloorRole =
    claims.user_role === "cashier" ||
    claims.user_role === "chef" ||
    claims.user_role === "branch_staff";

  const workState = isFloorRole ? await getTodayWorkState() : null;
  const beforeClockIn = workState?.status === "not_started";

  // Pre-clock-in tiles stay visible so the operator understands what unlocks.
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  const canManageBranch = canAccess(claims.user_role, "branch_settings");

  const branchTodayGroup = getBranchPrimaryHomeGroup(rawGroups);
  const branchTodayTileLimit = branchTodayGroup
    ? getBranchHomeTileLimit(branchTodayGroup.id)
    : 0;

  const isManagerLike =
    claims.user_role === "branch_manager" || claims.user_role === "owner";

  const groups = canManageBranch
    ? (() => {
        const managerHomeHrefs = getOperatorHomeTileHrefs(
          rawGroups,
          branchKind,
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

  const ownerLinks =
    claims.user_role === "owner"
      ? [
          {
            key: "owner-home",
            href: "/",
            icon: resolveOperatorTileIcon("LayoutDashboard"),
            title: APP_COPY_VI.ownerTitle,
          },
        ]
      : [];

  const revenueTargetRes = isManagerLike
    ? await fetchBranchRevenueTargetProgress(context.branchId)
    : null;
  const revenueTarget =
    revenueTargetRes?.success === true ? revenueTargetRes.data : null;

  return (
    <BranchOperatorPage title={APP_COPY_VI.branchHome} hideHeaderOnMobile>
      {claims.user_role !== "owner" ? (
        <Suspense fallback={<BranchTodayStatusPending />}>
          <BranchTodayStatus branchId={context.branchId} />
        </Suspense>
      ) : null}

      {revenueTarget ? (
        <BranchRevenueTargetStrip progress={revenueTarget} />
      ) : null}

      <Suspense fallback={<BranchQueuePending />}>
        <BranchQueueSection
          branchId={context.branchId}
          branchKind={branchKind}
        />
      </Suspense>

      {groups.map((group) => {
        // Home stations: Bán hàng + KDS only — pickup stays off this surface.
        const stationTiles = group.tiles.filter(
          (tile) => tile.moduleKey === "pos" || tile.moduleKey === "kds",
        );
        const supportingTiles = group.tiles.filter(
          (tile) =>
            tile.moduleKey !== "pos" &&
            tile.moduleKey !== "kds" &&
            tile.moduleKey !== "pickup",
        );
        const toLink = (tile: (typeof group.tiles)[number]) => ({
          key: `${group.id}-${tile.moduleKey}-${tile.href}`,
          href: tile.href,
          icon: resolveOperatorTileIcon(tile.icon),
          title:
            tile.moduleKey === "pos"
              ? homeCopy.posStation
              : tile.moduleKey === "kds"
                ? homeCopy.kdsStation
                : tile.label,
          disabled: tilesLockedBeforeClockIn && group.id === "sales_kitchen",
          disabledReason:
            tilesLockedBeforeClockIn && group.id === "sales_kitchen"
              ? homeCopy.lockedBeforeClockIn
              : undefined,
        });
        const showLimitsBesideOrders =
          group.id === "sales_kitchen" && isManagerLike;
        const hasSupporting =
          showLimitsBesideOrders || supportingTiles.length > 0;
        if (stationTiles.length === 0 && !hasSupporting) return null;

        const panelTitle =
          stationTiles.length > 0
            ? homeCopy.stationsTitle
            : group.id === "sales_kitchen"
              ? homeCopy.shiftControlTitle
              : group.title;

        return (
          <BranchOperatorPanel key={group.id} title={panelTitle} size="sm">
            <div className="flex flex-col gap-2">
              {stationTiles.length > 0 ? (
                <BranchOperatorActionSection
                  links={stationTiles.map(toLink)}
                  presentation="stations"
                />
              ) : null}
              {showLimitsBesideOrders ? (
                <div className="grid grid-cols-2 gap-2">
                  <BranchQuickMenuLimitTrigger
                    branchId={context.branchId}
                    className="w-full justify-start font-medium"
                  />
                  {supportingTiles.map((tile) => {
                    const link = toLink(tile);
                    const Icon = link.icon;
                    return (
                      <Button
                        key={link.key}
                        variant="outline"
                        size="touch"
                        disabled={link.disabled}
                        className="w-full justify-start font-medium"
                        render={
                          link.disabled ? undefined : <Link href={link.href} />
                        }
                      >
                        {Icon ? (
                          <Icon data-icon="inline-start" className="size-4" />
                        ) : null}
                        {link.title}
                      </Button>
                    );
                  })}
                </div>
              ) : supportingTiles.length > 0 ? (
                <BranchOperatorActionSection
                  links={supportingTiles.map(toLink)}
                  columns={2}
                  mobileColumns={2}
                  wideColumns
                  presentation="plain"
                />
              ) : null}
            </div>
          </BranchOperatorPanel>
        );
      })}

      <BranchOperatorActionSection
        links={ownerLinks}
        columns={2}
        mobileColumns={2}
        wideColumns
        presentation="plain"
      />
    </BranchOperatorPage>
  );
}
