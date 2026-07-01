import type { ElementType } from "react";
import type { ModuleKey } from "@comtammatu/shared/auth";

export type HubTile = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: ElementType;
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
};

type HubTileIcons = {
  tables: ElementType;
  pos: ElementType;
  printers: ElementType;
  kds: ElementType;
};

// Module-key gating mirrors the settings ownership: this hub only links to
// durable branch setup, while day-operation controls live in Today/Command.
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
  ];
}
