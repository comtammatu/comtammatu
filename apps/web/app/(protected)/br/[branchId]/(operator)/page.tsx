/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub homepage displays inline vietnamese warning for clock-in gate */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  MODULE_ACL,
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { getTodayWorkState } from "@lib/staff-runtime/_lib/today-work-state";
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

  // Pre-clock-in: tiles stay VISIBLE but disabled (owner decision, cutover
  // spec "Open implementation notes") — the greyed tile plus the banner is
  // the clock-in prompt.
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
          key: "branch-menu",
          href: MODULE_ACL.menu.path,
          icon: resolveOperatorTileIcon("Utensils"),
          title: MODULE_ACL.menu.label,
        },
        {
          key: "branch-settings",
          href: `/br/${context.branchId}/settings`,
          icon: resolveOperatorTileIcon("Settings"),
          title: MODULE_ACL.branch_settings.label,
        },
      ]
    : [];

  const ownerWorkspaceLinks =
    claims.user_role === "owner"
      ? [
          {
            key: "owner-finance",
            href: MODULE_ACL.finance.path,
            icon: resolveOperatorTileIcon("ChartBar"),
            title: MODULE_ACL.finance.label,
          },
          {
            key: "owner-hr",
            href: MODULE_ACL.hr.path,
            icon: resolveOperatorTileIcon("Users"),
            title: MODULE_ACL.hr.label,
          },
          {
            key: "owner-payroll",
            href: MODULE_ACL.hr_payroll.path,
            icon: resolveOperatorTileIcon("Briefcase"),
            title: MODULE_ACL.hr_payroll.label,
          },
          {
            key: "owner-settings",
            href: MODULE_ACL.settings.path,
            icon: resolveOperatorTileIcon("Settings"),
            title: MODULE_ACL.settings.label,
          },
        ]
      : [];

  const clockGateSection =
    isFloorRole && beforeClockIn ? (
      <NoteCallout tone="warning">
        Bạn cần <strong>chấm công vào ca</strong> để mở khóa các chức năng Bán
        hàng, Bếp và Kho chi nhánh.
      </NoteCallout>
    ) : null;

  return (
    <BranchOperatorPage title={APP_COPY_VI.operatorHome} hideHeaderOnMobile>
      {claims.user_role !== "owner" ? (
        <Suspense fallback={<HubTodayStatusPending />}>
          <HubTodayStatus branchId={context.branchId} />
        </Suspense>
      ) : null}

      {clockGateSection}

      <Suspense fallback={<HubQueuePending />}>
        <HubQueueSection branchId={context.branchId} />
      </Suspense>

      {groups.map((group) => (
        <BranchOperatorActionSection
          key={group.id}
          title={group.title}
          links={[
            ...group.tiles.map((tile) => ({
              key: `${group.id}-${tile.moduleKey}-${tile.href}`,
              href: tile.href,
              icon: resolveOperatorTileIcon(tile.icon),
              title: tile.label,
              disabled:
                tilesLockedBeforeClockIn && group.id === "sales_kitchen",
            })),
          ]}
          columns={2}
          mobileColumns={2}
          wideColumns
        />
      ))}

      <BranchOperatorActionSection
        title={APP_COPY_VI.operatorOpsActions}
        links={branchManagementLinks}
        columns={2}
        mobileColumns={2}
        wideColumns
      />

      <BranchOperatorActionSection
        title={APP_COPY_VI.storeManagement}
        links={ownerWorkspaceLinks}
        columns={2}
        mobileColumns={2}
        wideColumns
      />
    </BranchOperatorPage>
  );
}
