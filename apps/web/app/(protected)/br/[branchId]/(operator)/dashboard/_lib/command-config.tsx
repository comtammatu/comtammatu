import type { ReactNode } from "react";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  ClipboardCheck as IconClipboardCheck,
  CreditCard as IconCreditCard,
  Monitor as IconMonitor,
  Package as IconPackage,
  Printer as IconPrinter,
  ReceiptText as IconReceiptText,
  Utensils as IconUtensils,
  Users as IconUsers,
} from "lucide-react";
import {
  canAccess,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { formatVNTime } from "@comtammatu/shared/time";
import type { BadgeProps } from "@comtammatu/ui/components/badge";
import { messages } from "@lib/messages";
import type { BranchDayStatus } from "../data";

type BranchCopy = (typeof messages)["settings"]["branch"];

export type BranchCommandTile = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
};

export type BranchReadinessItem = {
  key: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeVariant: BadgeProps["variant"];
  href?: string;
  ctaLabel?: string;
};

export type BranchCommandTileGroups = {
  endDay: BranchCommandTile[];
  drilldown: BranchCommandTile[];
};

function buildTileGroups(
  branchId: number,
  copy: BranchCopy,
): BranchCommandTileGroups {
  return {
    endDay: [
      {
        moduleKey: "branch_pos_sessions",
        href: `/br/${branchId}/pos-sessions`,
        title: copy.commandPosSessionsTitle,
        description: copy.commandPosSessionsDescription,
        icon: <IconReceiptText />,
      },
    ],
    drilldown: [
      {
        moduleKey: "inventory",
        href: `/br/${branchId}/stock`,
        title: "Kho chi nhánh",
        description: copy.commandInventoryDescription,
        icon: <IconPackage />,
      },
    ],
  };
}

/**
 * Module-ACL-filtered nav tiles for the branch command lanes. The route already
 * gates branch access; per-tile filtering keeps each lane to surfaces the role
 * can open.
 */
export function buildVisibleTileGroups(
  branchId: number,
  role: StaffRole,
  copy: BranchCopy,
): BranchCommandTileGroups {
  const groups = buildTileGroups(branchId, copy);
  const visible = (tiles: BranchCommandTile[]) =>
    tiles.filter((tile) => canAccess(role, tile.moduleKey));
  return {
    endDay: visible(groups.endDay),
    drilldown: visible(groups.drilldown),
  };
}

type ReadinessHrefs = {
  menuHref?: string;
  floorHref?: string;
  kdsSettingsHref?: string;
  paymentSettingsHref?: string;
  posHref?: string;
  kdsHref?: string;
  printersHref?: string;
  staffHref?: string;
  settingsHref?: string;
  checkoutApprovalsHref?: string;
};

/**
 * Day-status readiness rows. CTA labels are only attached when the role has an
 * href to follow, so a row without access renders as a status line with no
 * action affordance.
 */
export function buildReadinessItems(
  day: BranchDayStatus,
  copy: BranchCopy,
  hrefs: ReadinessHrefs,
): BranchReadinessItem[] {
  const posOpen = day.posSessionOpenedAt !== null;
  const menuLimitsReady = day.menuLimitAvailableItems > 0;
  const floorReady = day.tablesTotal > 0 && day.setupActiveTerminals > 0;
  const kdsSetupReady = day.setupActiveKdsStations > 0;
  const printerConfigured = day.setupActivePrinters > 0;
  const staffReady = day.setupActiveStaff > 0;
  const paymentReady = day.setupPaymentReady;
  const hddtReady = day.setupHddtReady;

  const printerDescription = !printerConfigured
    ? copy.readinessPrinterNoConfig
    : !day.printerHasAgent
      ? copy.readinessPrinterNoAgent
      : day.printerOnline
        ? copy.readinessPrinterOnline
        : copy.readinessPrinterOffline;
  const printerFailedSuffix =
    day.printerFailed24h > 0
      ? ` ${copy.readinessPrinterFailed(day.printerFailed24h)}`
      : "";

  return [
    {
      key: "menu",
      icon: <IconUtensils />,
      title: copy.readinessMenuTitle,
      description: menuLimitsReady
        ? copy.readinessMenuReady(day.menuLimitAvailableItems)
        : copy.readinessMenuMissing,
      badge: menuLimitsReady
        ? copy.readinessReadyBadge
        : copy.readinessMissingBadge,
      badgeVariant: menuLimitsReady ? "success" : "warning",
      href: hrefs.menuHref,
      ctaLabel: hrefs.menuHref ? copy.readinessMenuCta : undefined,
    },
    {
      key: "floor",
      icon: <IconArmchair />,
      title: copy.readinessFloorTitle,
      description: floorReady
        ? copy.readinessFloorReady(day.tablesTotal, day.setupActiveTerminals)
        : copy.readinessFloorMissing(day.tablesTotal, day.setupActiveTerminals),
      badge: floorReady ? copy.readinessReadyBadge : copy.readinessMissingBadge,
      badgeVariant: floorReady ? "success" : "warning",
      href: hrefs.floorHref,
      ctaLabel: hrefs.settingsHref ? copy.readinessSetupCta : undefined,
    },
    {
      key: "kds-setup",
      icon: <IconChefHat />,
      title: copy.readinessKdsSetupTitle,
      description: kdsSetupReady
        ? copy.readinessKdsSetupReady(day.setupActiveKdsStations)
        : copy.readinessKdsSetupMissing,
      badge: kdsSetupReady
        ? copy.readinessReadyBadge
        : copy.readinessWarningBadge,
      badgeVariant: kdsSetupReady ? "success" : "secondary",
      href: hrefs.kdsSettingsHref,
      ctaLabel: hrefs.kdsSettingsHref ? copy.readinessSetupCta : undefined,
    },
    {
      key: "payment",
      icon: <IconCreditCard />,
      title: copy.readinessPaymentTitle,
      description: paymentReady
        ? copy.readinessPaymentReady(hddtReady)
        : copy.readinessPaymentMissing,
      badge:
        paymentReady && hddtReady
          ? copy.readinessReadyBadge
          : paymentReady
            ? copy.readinessPaymentHddtWarningBadge
            : copy.readinessMissingBadge,
      badgeVariant:
        paymentReady && hddtReady
          ? "success"
          : paymentReady
            ? "secondary"
            : "warning",
      href: hrefs.paymentSettingsHref,
      ctaLabel: hrefs.paymentSettingsHref
        ? copy.readinessPaymentCta
        : undefined,
    },
    {
      key: "pos",
      icon: <IconMonitor />,
      title: copy.readinessPosTitle,
      description:
        posOpen && day.posSessionOpenedAt
          ? copy.readinessPosOpen(formatVNTime(day.posSessionOpenedAt))
          : copy.readinessPosClosed,
      badge: posOpen
        ? copy.readinessPosOpenBadge
        : copy.readinessPosClosedBadge,
      badgeVariant: posOpen ? "success" : "warning",
      href: hrefs.posHref,
      ctaLabel: hrefs.posHref ? copy.readinessPosCta : undefined,
    },
    {
      key: "kds",
      icon: <IconChefHat />,
      title: copy.readinessKdsTitle,
      description:
        day.kitchenActiveOrders > 0
          ? copy.readinessKdsActive(day.kitchenActiveOrders)
          : copy.readinessKdsEmpty,
      badge: copy.readinessKdsBadge(day.kitchenActiveOrders),
      badgeVariant: day.kitchenActiveOrders > 0 ? "warning" : "secondary",
      href: hrefs.kdsHref,
      ctaLabel: hrefs.kdsHref ? copy.readinessKdsCta : undefined,
    },
    {
      key: "printer",
      icon: <IconPrinter />,
      title: copy.readinessPrinterTitle,
      description: `${printerDescription}${printerFailedSuffix}`,
      badge: !printerConfigured
        ? copy.readinessPrinterNoConfigBadge
        : day.printerOnline
          ? copy.readinessPrinterOnlineBadge
          : copy.readinessPrinterOfflineBadge,
      badgeVariant: !printerConfigured
        ? "secondary"
        : day.printerOnline
          ? "success"
          : day.printerFailed24h > 0 || day.printerHasAgent
            ? "destructive"
            : "secondary",
      href: hrefs.printersHref,
      ctaLabel: hrefs.printersHref ? copy.readinessPrinterCta : undefined,
    },
    {
      key: "staff",
      icon: <IconUsers />,
      title: copy.readinessStaffTitle,
      description: staffReady
        ? copy.readinessStaffReady(day.setupActiveStaff)
        : copy.readinessStaffMissing,
      badge: staffReady ? copy.readinessReadyBadge : copy.readinessWarningBadge,
      badgeVariant: staffReady ? "success" : "secondary",
      href: hrefs.staffHref,
      ctaLabel: hrefs.staffHref ? copy.readinessStaffCta : undefined,
    },
    {
      key: "checkout",
      icon: <IconClipboardCheck />,
      title: copy.readinessCheckoutTitle,
      description:
        day.pendingCheckouts > 0
          ? copy.readinessCheckoutPending(day.pendingCheckouts)
          : copy.readinessCheckoutEmpty,
      badge: String(day.pendingCheckouts),
      badgeVariant: day.pendingCheckouts > 0 ? "warning" : "secondary",
      href: hrefs.checkoutApprovalsHref,
      ctaLabel: hrefs.checkoutApprovalsHref
        ? copy.readinessCheckoutCta
        : undefined,
    },
  ];
}
