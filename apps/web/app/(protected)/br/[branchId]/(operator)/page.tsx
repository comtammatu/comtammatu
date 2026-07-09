/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub homepage displays inline vietnamese warning for clock-in gate */
import { Suspense } from "react";
import { ChefHat, Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveOperatorTiles, type BranchKind } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  BranchOperatorActionBar,
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { getTodayWorkState } from "@lib/staff-runtime/_lib/today-work-state";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../_lib/parse-branch-id";
import {
  CENTRAL_HOME_TILE_SUFFIXES,
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

const branchCopy = messages.settings.branch;

// Approved home tile curation per central kind. Suffixes are matched against tile hrefs.
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
  const basePath = `/br/${context.branchId}`;
  const showTodayCard = claims.user_role !== "owner";

  // Pre-clock-in gate for cashier/chef roles
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";

  // Data fetch for locking tiles is fast so we can await it here.
  const workState = await getTodayWorkState();
  const beforeClockIn = workState.status === "not_started";

  // Pre-clock-in: tiles stay VISIBLE but disabled (owner decision, cutover
  // spec "Open implementation notes") — the greyed tile plus the banner is
  // the clock-in prompt.
  const lockedGroupIds = new Set(["sales_kitchen", "stock"]);
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  const isCentral = branchKind !== "branch";
  const isCentralSupply = branchKind === "central_supply";
  const centralSuffixes = CENTRAL_HOME_TILE_SUFFIXES[branchKind] ?? null;
  // Central homes render one curated job-tile group; deeper jobs stay under Stock.
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
                  id: "central-jobs",
                  title: isCentralSupply
                    ? branchCopy.centralSupplyTilesTitle
                    : branchCopy.centralKitchenTilesTitle,
                  tiles: stockTiles,
                },
              ]
            : [];
        })()
      : rawGroups;
  const isBranchManagerOrOwner =
    claims.user_role === "branch_manager" || claims.user_role === "owner";

  const branchTodayGroup = getBranchPrimaryHomeGroup(rawGroups);
  const branchTodayTileLimit = branchTodayGroup
    ? getBranchHomeTileLimit(branchTodayGroup.id)
    : 0;

  const branchTodayGroups = isBranchManagerOrOwner
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

  const groups = isCentral ? centralGroups : branchTodayGroups;

  const centralAction = isCentral ? (
    <Button asChild size="touch-lg" className="w-full">
      <Link
        href={
          isCentralSupply
            ? `${basePath}/stock/grn/new`
            : `${basePath}/stock/production`
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
      </Link>
    </Button>
  ) : null;

  const clockGateSection =
    isFloorRole && beforeClockIn ? (
      <NoteCallout tone="warning">
        Bạn cần <strong>chấm công vào ca</strong> để mở khóa các chức năng Bán
        hàng, Bếp và Kho chi nhánh.
      </NoteCallout>
    ) : null;

  const isCentralKitchen = branchKind === "central_kitchen";
  const secondaryLinksSection = isCentral ? (
    <BranchOperatorActionBar align="start" className="sm:justify-center">
      <Button
        asChild
        variant="outline"
        size="touch"
        className="w-full sm:w-fit"
      >
        <Link href={`${basePath}/shift/clock`}>
          {branchCopy.centralClockLink}
        </Link>
      </Button>
      {isCentralKitchen ? (
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href={`${basePath}/stock/production/recipes`}>Công thức</Link>
        </Button>
      ) : null}
    </BranchOperatorActionBar>
  ) : null;

  return (
    <BranchOperatorPage title={APP_COPY_VI.operatorHome} hideHeaderOnMobile>
      {showTodayCard ? (
        <Suspense fallback={<HubTodayStatusPending />}>
          <HubTodayStatus branchId={context.branchId} />
        </Suspense>
      ) : null}

      {centralAction}
      {clockGateSection}

      <Suspense fallback={<HubQueuePending />}>
        <HubQueueSection branchId={context.branchId} branchKind={branchKind} />
      </Suspense>

      {groups.map((group) => (
        <BranchOperatorActionSection
          key={group.id}
          title={group.title}
          description={
            isCentral
              ? isCentralSupply
                ? branchCopy.centralSupplyTilesDescription
                : branchCopy.centralKitchenTilesDescription
              : undefined
          }
          links={[
            ...group.tiles.map((tile) => ({
              key: `${group.id}-${tile.moduleKey}-${tile.href}`,
              href: tile.href,
              icon: resolveOperatorTileIcon(tile.icon),
              title: tile.label,
              disabled:
                tilesLockedBeforeClockIn && lockedGroupIds.has(group.id),
            })),
          ]}
          columns={2}
          mobileColumns={2}
          wideColumns
        />
      ))}

      {secondaryLinksSection}
    </BranchOperatorPage>
  );
}
