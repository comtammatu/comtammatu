import {
  Briefcase as IconBriefcase,
  Building2 as IconBuilding2,
  ClipboardList as IconClipboardList,
  Package as IconPackage,
  Settings as IconSettings,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import {
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
  LinkCardGrid,
} from "@/components/surface";
import { messages } from "@lib/messages";

export function OwnerOverview() {
  const copy = messages.owner.dashboard;

  return (
    <AppPage density="compact" width="wide">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <AppSection
        title={copy.operationsTitle}
        description={copy.operationsDescription}
      >
        <LinkCardGrid className="xl:grid-cols-3">
          <AppLinkCard
            href={MODULE_ACL.finance.path}
            title={MODULE_ACL.finance.label}
            description={copy.financeDescription}
            icon={<IconWallet aria-hidden="true" />}
            ctaLabel={copy.openModule}
          />
          <AppLinkCard
            href={MODULE_ACL.orders.path}
            title={MODULE_ACL.orders.label}
            description={copy.ordersDescription}
            icon={<IconClipboardList aria-hidden="true" />}
            tone="info"
            ctaLabel={copy.openModule}
          />
          <AppLinkCard
            href={MODULE_ACL.inventory.path}
            title={MODULE_ACL.inventory.label}
            description={copy.inventoryDescription}
            icon={<IconPackage aria-hidden="true" />}
            tone="success"
            ctaLabel={copy.openModule}
          />
          <AppLinkCard
            href={MODULE_ACL.menu.path}
            title={MODULE_ACL.menu.label}
            description={copy.menuDescription}
            icon={<IconUtensils aria-hidden="true" />}
            tone="secondary"
            ctaLabel={copy.openModule}
          />
          <AppLinkCard
            href={MODULE_ACL.hr.path}
            title={MODULE_ACL.hr.label}
            description={copy.hrDescription}
            icon={<IconBriefcase aria-hidden="true" />}
            ctaLabel={copy.openModule}
          />
        </LinkCardGrid>
      </AppSection>

      <AppSection
        title={copy.foundationTitle}
        description={copy.foundationDescription}
      >
        <LinkCardGrid className="xl:grid-cols-3">
          <AppLinkCard
            href={MODULE_ACL.branches.path}
            title={MODULE_ACL.branches.label}
            description={copy.branchesDescription}
            icon={<IconBuilding2 aria-hidden="true" />}
            tone="info"
            ctaLabel={copy.openModule}
          />
          <AppLinkCard
            href={MODULE_ACL.settings.path}
            title={MODULE_ACL.settings.label}
            description={copy.settingsDescription}
            icon={<IconSettings aria-hidden="true" />}
            tone="secondary"
            ctaLabel={copy.openModule}
          />
        </LinkCardGrid>
      </AppSection>
    </AppPage>
  );
}
