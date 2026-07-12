import type { ElementType } from "react";

export type HubTile = {
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

export function buildHubTiles(
  branchId: number,
  copy: HubTileCopy,
  icons: HubTileIcons,
): HubTile[] {
  return [
    {
      href: `/br/${branchId}/settings/tables`,
      title: copy.tablesSetupTitle,
      description: copy.tablesSetupDescription,
      icon: icons.tables,
    },
    {
      href: `/br/${branchId}/settings/pos`,
      title: copy.posSetupTitle,
      description: copy.posSetupDescription,
      icon: icons.pos,
    },
    {
      href: `/br/${branchId}/settings/kds`,
      title: copy.kdsSetupTitle,
      description: copy.kdsSetupDescription,
      icon: icons.kds,
    },
    {
      href: `/br/${branchId}/settings/printers`,
      title: copy.printersSetupTitle,
      description: copy.printersSetupDescription,
      icon: icons.printers,
    },
  ];
}
