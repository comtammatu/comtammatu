import type { ReactNode } from "react";
import type { ModuleKey } from "@comtammatu/shared/auth";

export type HubTile = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
};

type HubTileCopy = {
  tablesSetupTitle: string;
  tablesSetupDescription: string;
  posSetupTitle: string;
  posSetupDescription: string;
  printersSetupTitle: string;
  printersSetupDescription: string;
  kdsSetupTitle: string;
  kdsSetupDescription: string;
  commandPosSessionsTitle: string;
  commandPosSessionsDescription: string;
  menuLimitsTitle: string;
  commandMenuLimitsDescription: string;
};

type HubTileIcons = {
  tables: ReactNode;
  pos: ReactNode;
  printers: ReactNode;
  kds: ReactNode;
  posSessions: ReactNode;
  menuLimits: ReactNode;
};

// Module-key gating mirrors the branch dashboard: the four sub-settings routes
// live behind `branch_settings`, the POS-sessions ledger behind
// `branch_dashboard`, and daily limits behind `branch_menu_limits`.
export function buildHubTiles(
  branchId: number,
  copy: HubTileCopy,
  icons: HubTileIcons,
): HubTile[] {
  return [
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings/tables`,
      title: copy.tablesSetupTitle,
      description: copy.tablesSetupDescription,
      icon: icons.tables,
    },
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings/pos`,
      title: copy.posSetupTitle,
      description: copy.posSetupDescription,
      icon: icons.pos,
    },
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings/printers`,
      title: copy.printersSetupTitle,
      description: copy.printersSetupDescription,
      icon: icons.printers,
    },
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings/kds`,
      title: copy.kdsSetupTitle,
      description: copy.kdsSetupDescription,
      icon: icons.kds,
    },
    {
      moduleKey: "branch_dashboard",
      href: `/br/${branchId}/settings/pos-sessions`,
      title: copy.commandPosSessionsTitle,
      description: copy.commandPosSessionsDescription,
      icon: icons.posSessions,
    },
    {
      moduleKey: "branch_menu_limits",
      href: `/br/${branchId}/menu-limits`,
      title: copy.menuLimitsTitle,
      description: copy.commandMenuLimitsDescription,
      icon: icons.menuLimits,
    },
  ];
}
