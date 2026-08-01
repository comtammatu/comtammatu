import { Fragment, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChefHat, Truck } from "lucide-react";
import {
  canAccess,
  MODULE_ACL,
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
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
  CENTRAL_HOME_TILE_SUFFIXES,
  getBranchHomeTileLimit,
  getBranchManagerHomePhaseGroups,
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
const branchCopy = messages.settings.branch;
const stationDescriptions: Record<string, string> = {
  pos: homeCopy.posDescription,
  kds: homeCopy.kdsDescription,
  runner: homeCopy.runnerDescription,
};

const CENTRAL_KITCHEN_HOME_LABELS = [
  { suffix: "/stock/grn", label: branchCopy.centralKitchenReceiveJob },
  {
    suffix: "/stock/production",
    label: branchCopy.centralKitchenProductionJob,
  },
  { suffix: "/stock/transfer", label: branchCopy.centralKitchenDispatchJob },
  {
    suffix: "/stock/purchase-requests",
    label: branchCopy.centralPurchaseRequestsJob,
  },
] as const;

function getCentralKitchenHomeLabel(href: string, fallback: string): string {
  return (
    CENTRAL_KITCHEN_HOME_LABELS.find(({ suffix }) => href.endsWith(suffix))
      ?.label ?? fallback
  );
}

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
  const isCentral = branchKind !== "branch";
  const isCentralSupply = branchKind === "central_supply";
  const isCentralKitchen = branchKind === "central_kitchen";
  const basePath = `/br/${context.branchId}`;
  const rawGroups = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    branchKind,
  );
  // Pre-clock-in gate for cashier/chef roles
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";

  const workState = isFloorRole && !isCentral ? await getTodayWorkState() : null;
  const beforeClockIn = workState?.status === "not_started";

  // Pre-clock-in tiles stay visible so the operator understands what unlocks.
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  const canManageBranch = canAccess(claims.user_role, "branch_settings");

  const branchTodayGroup = getBranchPrimaryHomeGroup(rawGroups);
  const branchTodayTileLimit = branchTodayGroup
    ? getBranchHomeTileLimit(branchTodayGroup.id)
    : 0;

  const isManagerLike =
    !isCentral &&
    (claims.user_role === "branch_manager" || claims.user_role === "owner");
  const managerPhases = isManagerLike
    ? getBranchManagerHomePhaseGroups(rawGroups, claims.user_role)
    : null;

  const centralSuffixes = CENTRAL_HOME_TILE_SUFFIXES[branchKind] ?? null;
  const centralGroups =
    isCentral && centralSuffixes
      ? (() => {
          const stockTiles = rawGroups
            .flatMap((group) => (group.id === "stock" ? group.tiles : []))
            .filter((tile) =>
              centralSuffixes.some((suffix) => tile.href.endsWith(suffix)),
            )
            .sort(
              (a, b) =>
                centralSuffixes.findIndex((s) => a.href.endsWith(s)) -
                centralSuffixes.findIndex((s) => b.href.endsWith(s)),
            );
          return stockTiles.length > 0
            ? [
                {
                  id: "central-jobs" as const,
                  title: isCentralSupply
                    ? branchCopy.centralSupplyTilesTitle
                    : branchCopy.centralKitchenTilesTitle,
                  tiles: stockTiles,
                },
              ]
            : [];
        })()
      : null;

  const groups = isCentral
    ? (centralGroups ?? [])
    : canManageBranch
      ? (() => {
          const managerHomeHrefs = getOperatorHomeTileHrefs(
            rawGroups,
            branchKind,
            claims.user_role,
          );
          const phaseHrefs = managerPhases
            ? new Set([
                ...managerPhases.phases.open,
                ...managerPhases.phases.run,
                ...managerPhases.phases.close,
              ])
            : new Set<string>();
          return rawGroups
            .map((group) => ({
              ...group,
              tiles: group.tiles.filter(
                (tile) =>
                  managerHomeHrefs.has(tile.href) &&
                  !phaseHrefs.has(tile.href),
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

  const phaseSections: {
    phase: "open" | "run" | "close";
    title: string;
    description: string;
    tiles: { href: string; moduleKey: string; icon: string; label: string }[];
  }[] = [];
  if (managerPhases) {
    const phaseConfig: {
      phase: "open" | "run" | "close";
      title: string;
      description: string;
    }[] = [
      {
        phase: "open",
        title: homeCopy.phaseOpenTitle,
        description: homeCopy.phaseOpenDescription,
      },
      {
        phase: "run",
        title: homeCopy.phaseRunTitle,
        description: homeCopy.phaseRunDescription,
      },
      {
        phase: "close",
        title: homeCopy.phaseCloseTitle,
        description: homeCopy.phaseCloseDescription,
      },
    ];
    for (const config of phaseConfig) {
      const hrefs = managerPhases.phases[config.phase];
      if (hrefs.size === 0) continue;
      const phaseTiles = rawGroups
        .flatMap((group) => group.tiles)
        .filter((tile) => hrefs.has(tile.href));
      if (phaseTiles.length > 0) {
        phaseSections.push({
          phase: config.phase,
          title: config.title,
          description: config.description,
          tiles: phaseTiles,
        });
      }
    }
  }

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

  const showRevenueTargetStrip = isManagerLike;
  const revenueTargetRes = showRevenueTargetStrip
    ? await fetchBranchRevenueTargetProgress(context.branchId)
    : null;
  const revenueTarget =
    revenueTargetRes?.success === true ? revenueTargetRes.data : null;

  const pageTitle = isCentralKitchen
    ? branchCopy.centralKitchenHomeTitle
    : isCentralSupply
      ? branchCopy.centralSupplyTilesTitle
      : APP_COPY_VI.branchHome;

  return (
    <BranchOperatorPage title={pageTitle} hideHeaderOnMobile>
      {!isCentral && claims.user_role !== "owner" ? (
        <Suspense fallback={<BranchTodayStatusPending />}>
          <BranchTodayStatus branchId={context.branchId} />
        </Suspense>
      ) : null}

      {isCentral ? (
        <Button
          size="touch-lg"
          className="w-full"
          render={
            <Link
              href={
                isCentralSupply
                  ? `${basePath}/stock/grn`
                  : `${basePath}/stock/production`
              }
            />
          }
        >
          {isCentralSupply ? (
            <Truck data-icon="inline-start" />
          ) : (
            <ChefHat data-icon="inline-start" />
          )}
          {isCentralSupply
            ? branchCopy.centralReceiveCta
            : branchCopy.centralProductionCta}
        </Button>
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

      {phaseSections.map((section) => {
        const stationTiles = section.tiles.filter(
          (tile) => stationDescriptions[tile.moduleKey] != null,
        );
        const supportingTiles = section.tiles.filter(
          (tile) => stationDescriptions[tile.moduleKey] == null,
        );
        const toPhaseLink = (tile: (typeof section.tiles)[number]) => ({
          key: `phase-${section.phase}-${tile.moduleKey}-${tile.href}`,
          href: tile.href,
          icon: resolveOperatorTileIcon(tile.icon),
          title: tile.label,
          disabled: tilesLockedBeforeClockIn,
          disabledReason: tilesLockedBeforeClockIn
            ? homeCopy.lockedBeforeClockIn
            : undefined,
        });

        return (
          <Fragment key={`phase-${section.phase}`}>
            {stationTiles.length > 0 ? (
              <BranchOperatorActionSection
                title={section.title}
                links={stationTiles.map(toPhaseLink)}
                presentation="stations"
              />
            ) : null}
            {supportingTiles.length > 0 ? (
              <BranchOperatorActionSection
                title={section.title}
                links={supportingTiles.map(toPhaseLink)}
                columns={2}
                mobileColumns={2}
                wideColumns
                presentation="plain"
              />
            ) : null}
          </Fragment>
        );
      })}

      {groups.map((group) => {
        if (isCentral) {
          return (
            <BranchOperatorActionSection
              key={group.id}
              title={group.title}
              description={
                isCentralSupply
                  ? branchCopy.centralSupplyTilesDescription
                  : branchCopy.centralKitchenTilesDescription
              }
              links={group.tiles.map((tile) => ({
                key: `${group.id}-${tile.moduleKey}-${tile.href}`,
                href: tile.href,
                icon: resolveOperatorTileIcon(tile.icon),
                title: isCentralKitchen
                  ? getCentralKitchenHomeLabel(tile.href, tile.label)
                  : tile.label,
              }))}
              columns={2}
              mobileColumns={2}
              wideColumns
              presentation="plain"
            />
          );
        }

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
          disabled: tilesLockedBeforeClockIn && group.id === "sales_kitchen",
          disabledReason:
            tilesLockedBeforeClockIn && group.id === "sales_kitchen"
              ? homeCopy.lockedBeforeClockIn
              : undefined,
        });

        return (
          <Fragment key={group.id}>
            <BranchOperatorActionSection
              title={homeCopy.stationsTitle}
              links={stationTiles.map(toLink)}
              presentation="stations"
            />
            <BranchOperatorActionSection
              title={
                group.id === "sales_kitchen"
                  ? homeCopy.shiftControlTitle
                  : group.title
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

      {!isCentral ? (
        <BranchOperatorActionSection
          title={APP_COPY_VI.operatorOpsActions}
          links={branchManagementLinks}
          columns={2}
          mobileColumns={2}
          wideColumns
          presentation="plain"
        />
      ) : null}

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
