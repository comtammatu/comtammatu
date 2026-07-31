import { Fragment, Suspense } from "react";
import { notFound } from "next/navigation";
import {
  canAccess,
  MODULE_ACL,
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
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
import {
  BranchTodayStatusPending,
  BranchQueuePending,
} from "./_components/home/branch-home-skeletons";
import { BranchRevenueTargetStrip } from "./_components/home/branch-revenue-target-strip";
import { fetchBranchRevenueTargetProgress } from "@/(protected)/finance/targets/actions";

const homeCopy = messages.operator.home;
const stationDescriptions: Record<string, string> = {
  pos: homeCopy.posDescription,
  kds: homeCopy.kdsDescription,
  runner: homeCopy.runnerDescription,
};

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

  const workState = isFloorRole ? await getTodayWorkState() : null;
  const beforeClockIn = workState?.status === "not_started";

  // Pre-clock-in tiles stay visible so the operator understands what unlocks.
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  const canManageBranch = canAccess(claims.user_role, "branch_settings");

  const branchTodayGroup = getBranchPrimaryHomeGroup(rawGroups);
  const branchTodayTileLimit = branchTodayGroup
    ? getBranchHomeTileLimit(branchTodayGroup.id)
    : 0;

  const groups = canManageBranch
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

  const branchManagementLinks = canManageBranch
    ? [
        {
          key: "branch-settings",
          href: `/br/${context.branchId}/settings`,
          icon: resolveOperatorTileIcon("Settings"),
          title: MODULE_ACL.branch_settings.label,
        },
      ]
    : [];

  const ownerLinks = claims.user_role === "owner"
    ? [
        {
          key: "owner-home",
          href: "/",
          icon: resolveOperatorTileIcon("LayoutDashboard"),
          title: APP_COPY_VI.ownerTitle,
        },
      ]
    : [];

  const showRevenueTargetStrip =
    branchKind === "branch" &&
    (claims.user_role === "owner" || claims.user_role === "branch_manager");
  const revenueTargetRes = showRevenueTargetStrip
    ? await fetchBranchRevenueTargetProgress(context.branchId)
    : null;
  const revenueTarget =
    revenueTargetRes?.success === true ? revenueTargetRes.data : null;

  return (
    <BranchOperatorPage title={APP_COPY_VI.branchHome}>
      {revenueTarget ? (
        <BranchRevenueTargetStrip progress={revenueTarget} />
      ) : null}

      {claims.user_role !== "owner" ? (
        <Suspense fallback={<BranchTodayStatusPending />}>
          <BranchTodayStatus branchId={context.branchId} />
        </Suspense>
      ) : null}

      <Suspense fallback={<BranchQueuePending />}>
        <BranchQueueSection branchId={context.branchId} />
      </Suspense>

      {groups.map((group) => {
        const stationTiles = group.tiles.filter(
          (tile) => stationDescriptions[tile.moduleKey] != null,
        );
        const supportingTiles = group.tiles.filter(
          (tile) => stationDescriptions[tile.moduleKey] == null,
        );
        const toLink = (tile: (typeof group.tiles)[number]) => ({
          key: `${group.id}-${tile.moduleKey}-${tile.href}`,
          href: tile.href,
          icon: resolveOperatorTileIcon(tile.icon),
          title: tile.label,
          description: stationDescriptions[tile.moduleKey],
          disabled: tilesLockedBeforeClockIn && group.id === "sales_kitchen",
        });

        return (
          <Fragment key={group.id}>
            <BranchOperatorActionSection
              title={homeCopy.stationsTitle}
              description={homeCopy.stationsDescription}
              links={stationTiles.map(toLink)}
              presentation="stations"
            />
            <BranchOperatorActionSection
              title={
                group.id === "sales_kitchen"
                  ? homeCopy.shiftControlTitle
                  : group.title
              }
              description={
                group.id === "sales_kitchen"
                  ? homeCopy.shiftControlDescription
                  : undefined
              }
              links={supportingTiles.map(toLink)}
              columns={2}
              mobileColumns={2}
              wideColumns
              presentation="plain"
            />
          </Fragment>
        );
      })}

      <BranchOperatorActionSection
        title={APP_COPY_VI.operatorOpsActions}
        links={branchManagementLinks}
        columns={2}
        mobileColumns={2}
        wideColumns
        presentation="plain"
      />

      <BranchOperatorActionSection
        title={APP_COPY_VI.ownerTitle}
        links={ownerLinks}
        columns={2}
        mobileColumns={2}
        wideColumns
        presentation="plain"
      />
    </BranchOperatorPage>
  );
}
