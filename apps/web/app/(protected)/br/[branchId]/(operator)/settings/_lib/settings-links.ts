import type { ElementType } from "react";
import type { ModuleKey } from "@comtammatu/shared/auth";

export type SettingsLink = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: ElementType;
};

type SettingsLinkCopy = {
  tablesSetupTitle: string;
  tablesSetupDescription: string;
  posSetupTitle: string;
  posSetupDescription: string;
  printersSetupTitle: string;
  printersSetupDescription: string;
  kdsSetupTitle: string;
  kdsSetupDescription: string;
  audioSetupTitle?: string;
  audioSetupDescription?: string;
};

type SettingsLinkIcons = {
  tables: ElementType;
  pos: ElementType;
  printers: ElementType;
  kds: ElementType;
  audio?: ElementType;
};

// Module-key gating keeps branch setup separate from daily operations.
export function buildSettingsLinks(
  branchId: number,
  copy: SettingsLinkCopy,
  icons: SettingsLinkIcons,
): SettingsLink[] {
  const links: SettingsLink[] = [
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
      href: `/br/${branchId}/settings/kds`,
      title: copy.kdsSetupTitle,
      description: copy.kdsSetupDescription,
      icon: icons.kds,
    },
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings/printers`,
      title: copy.printersSetupTitle,
      description: copy.printersSetupDescription,
      icon: icons.printers,
    },
  ];

  if (icons.audio && copy.audioSetupTitle && copy.audioSetupDescription) {
    links.push({
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings/audio`,
      title: copy.audioSetupTitle,
      description: copy.audioSetupDescription,
      icon: icons.audio,
    });
  }

  return links;
}
