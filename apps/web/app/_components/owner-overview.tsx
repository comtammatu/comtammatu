import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  Briefcase as IconBriefcase,
  Building2 as IconBuilding2,
  ClipboardList as IconClipboardList,
  type LucideIcon,
  Package as IconPackage,
  Settings as IconSettings,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";

type OwnerModuleLink = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const copy = messages.owner.dashboard;

const operationsModules: OwnerModuleLink[] = [
  {
    href: MODULE_ACL.finance.path,
    title: MODULE_ACL.finance.label,
    description: copy.financeDescription,
    icon: IconWallet,
  },
  {
    href: MODULE_ACL.orders.path,
    title: MODULE_ACL.orders.label,
    description: copy.ordersDescription,
    icon: IconClipboardList,
  },
  {
    href: MODULE_ACL.inventory.path,
    title: MODULE_ACL.inventory.label,
    description: copy.inventoryDescription,
    icon: IconPackage,
  },
  {
    href: MODULE_ACL.menu.path,
    title: MODULE_ACL.menu.label,
    description: copy.menuDescription,
    icon: IconUtensils,
  },
  {
    href: MODULE_ACL.hr.path,
    title: MODULE_ACL.hr.label,
    description: copy.hrDescription,
    icon: IconBriefcase,
  },
];

const foundationModules: OwnerModuleLink[] = [
  {
    href: MODULE_ACL.branches.path,
    title: MODULE_ACL.branches.label,
    description: copy.branchesDescription,
    icon: IconBuilding2,
  },
  {
    href: MODULE_ACL.settings.path,
    title: MODULE_ACL.settings.label,
    description: copy.settingsDescription,
    icon: IconSettings,
  },
];

function ModuleLinks({
  modules,
  className,
}: {
  modules: OwnerModuleLink[];
  className?: string;
}) {
  return (
    <ItemGroup className={className}>
      {modules.map((module) => {
        const Icon = module.icon;

        return (
          <Item
            key={module.href}
            size="sm"
            className="group/module-link chrome-tap min-h-20 select-none bg-background/50 px-3 py-3 motion-safe:transition-[background-color,box-shadow,transform] motion-safe:duration-[var(--motion-fast)] motion-safe:ease-[var(--ease-move)] motion-safe:active:scale-[0.99]"
            render={<Link href={module.href} />}
          >
            <ItemMedia
              variant="icon"
              className="size-10 rounded-md bg-primary/10 text-primary"
            >
              <Icon aria-hidden="true" className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle size="heading">{module.title}</ItemTitle>
              <ItemDescription>{module.description}</ItemDescription>
            </ItemContent>
            <ItemActions className="text-muted-foreground">
              <IconArrowRight
                aria-hidden="true"
                className="size-4 motion-safe:transition-transform motion-safe:duration-[var(--motion-fast)] motion-safe:ease-[var(--ease-move)] motion-safe:group-hover/module-link:translate-x-1 motion-safe:group-focus-visible/module-link:translate-x-1"
              />
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

export function OwnerOverview() {
  return (
    <AppPage density="compact" width="wide">
      <AppPageHeader
        title={copy.title}
        description={copy.description}
      />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <AppSection
          title={copy.operationsTitle}
          description={copy.operationsDescription}
          headingLevel="h2"
        >
          <ModuleLinks
            modules={operationsModules}
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
          />
        </AppSection>

        <AppSection
          title={copy.foundationTitle}
          description={copy.foundationDescription}
          headingLevel="h2"
        >
          <ModuleLinks
            modules={foundationModules}
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"
          />
        </AppSection>
      </div>
    </AppPage>
  );
}
