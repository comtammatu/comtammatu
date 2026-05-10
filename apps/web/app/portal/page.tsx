import type { ElementType } from "react";
import {
  BarChart3 as IconBarChart,
  Bell as IconBell,
  Briefcase as IconBriefcase,
  ChefHat as IconChefHat,
  Home as IconHome,
  LayoutDashboard as IconLayoutDashboard,
  LogOut as IconLogout,
  MessageSquare as IconMessageSquare,
  Monitor as IconMonitor,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  ShoppingBag as IconShoppingBag,
  UserCircle as IconUserCircle,
  Users as IconUsers,
  Wallet as IconWallet,
} from "lucide-react";
import {
  ROLE_LABEL_VI,
  resolveDiscoveredAppGroups,
  type DiscoveredAppLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppLinkCard, AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { getEmployeeContext } from "@/employee/_lib/employee-context";
import { messages } from "@lib/messages";

type PortalTone = "primary" | "success" | "warning" | "info" | "secondary";

type PortalCard = {
  title: string;
  description: string;
  href: string | null;
  icon: ElementType;
  tone?: PortalTone;
  badge?: string;
  disabledReason?: string;
};

const copy = messages.portal;

const ICONS = {
  BarChart3: IconBarChart,
  Bell: IconBell,
  Briefcase: IconBriefcase,
  ChefHat: IconChefHat,
  LayoutDashboard: IconLayoutDashboard,
  MessageSquare: IconMessageSquare,
  Monitor: IconMonitor,
  Package: IconPackage,
  Receipt: IconReceipt,
  Settings: IconSettings,
  Users: IconUsers,
  Wallet: IconWallet,
} satisfies Record<string, ElementType>;

const BRANCH_OPERATORS: readonly StaffRole[] = [
  "branch_manager",
  "cashier",
  "waiter",
  "chef",
] as const;

function iconFor(name: string): ElementType {
  return ICONS[name as keyof typeof ICONS] ?? IconHome;
}

function branchToolCard(
  role: StaffRole,
  branchId: number | null,
  branchIsOperational: boolean,
): PortalCard {
  const isKitchen = role === "chef";
  const target = isKitchen ? "kds" : "pos";
  const cardCopy = isKitchen ? copy.cards.kds : copy.cards.pos;

  return {
    title: cardCopy.title,
    description: cardCopy.description,
    href: branchId !== null && branchIsOperational ? `/br/${branchId}/${target}` : null,
    icon: isKitchen ? IconChefHat : IconMonitor,
    tone: isKitchen ? "warning" : "primary",
    disabledReason: copy.blockedMissingBranch,
  };
}

function resolvePrimaryCard(
  role: StaffRole,
  branchId: number | null,
  branchIsOperational: boolean,
): PortalCard {
  switch (role) {
    case "owner":
    case "super_manager":
      return {
        ...copy.cards.admin,
        href: "/admin/dashboard",
        icon: IconLayoutDashboard,
        tone: "primary",
      };
    case "area_manager":
      return {
        ...copy.cards.area,
        href: "/inventory",
        icon: IconPackage,
        tone: "success",
      };
    case "branch_manager":
      return {
        ...copy.cards.branchManager,
        href: "/orders",
        icon: IconShoppingBag,
        tone: "info",
      };
    case "warehouse_manager":
      return {
        ...copy.cards.inventory,
        href: "/inventory",
        icon: IconPackage,
        tone: "success",
      };
    case "production_manager":
      return {
        ...copy.cards.production,
        href: "/inventory/production",
        icon: IconPackage,
        tone: "warning",
      };
    case "cashier":
    case "waiter":
    case "chef":
      return branchToolCard(role, branchId, branchIsOperational);
    case "office":
      return {
        ...copy.cards.employee,
        href: "/employee",
        icon: IconUserCircle,
        tone: "secondary",
      };
  }
}

function discoveryToCard(item: DiscoveredAppLink): PortalCard {
  return {
    title: item.label,
    description:
      item.status === "blocked"
        ? copy.blockedMissingBranch
        : item.surface === "admin"
          ? copy.groups.system
          : item.surface === "workspace"
            ? copy.primary.description
            : copy.primary.title,
    href: item.href,
    icon: iconFor(item.icon),
    tone:
      item.surface === "admin"
        ? "primary"
        : item.surface === "workspace"
          ? "success"
          : "info",
    disabledReason:
      item.status === "blocked" ? copy.blockedMissingBranch : undefined,
  };
}

function PortalCardGrid({ cards }: { cards: PortalCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const disabled = card.href === null;
        return (
          <AppLinkCard
            key={`${card.title}-${card.href ?? "blocked"}`}
            href={card.href ?? "#"}
            title={card.title}
            description={card.description}
            badge={card.badge}
            icon={<Icon />}
            tone={card.tone}
            ctaLabel={copy.open}
            disabled={disabled}
            disabledReason={card.disabledReason}
          />
        );
      })}
    </div>
  );
}

export default async function PortalPage() {
  const { supabase, claims } = await loadAuthState();
  const employeeContext = await getEmployeeContext();
  const branchId = claims.branch_id;

  let branchName = employeeContext?.branchName ?? null;
  let branchKind: string | null = null;
  if (branchId !== null) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name, branch_kind")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();

    branchName = branchName ?? branch?.name ?? null;
    branchKind = branch?.branch_kind ?? null;
  }

  const branchIsOperational = branchKind === "branch";
  const includeBlockedBranchOps =
    branchId === null &&
    BRANCH_OPERATORS.some((role) => role === claims.user_role);
  const appGroups = resolveDiscoveredAppGroups(claims.user_role, branchId, {
    includeBlocked: includeBlockedBranchOps,
  });
  const primaryCard = resolvePrimaryCard(
    claims.user_role,
    branchId,
    branchIsOperational,
  );
  const selfServiceCards: PortalCard[] = [
    {
      ...copy.cards.employee,
      href: "/employee",
      icon: IconUserCircle,
      tone: "secondary",
    },
    {
      ...copy.cards.notifications,
      href: "/notifications",
      icon: IconBell,
      tone: "info",
    },
  ];

  return (
    <AppPage width="wide">
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        badge={{ children: ROLE_LABEL_VI[claims.user_role] }}
        actions={
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              <IconLogout data-icon="inline-start" />
              {messages.common.signOut}
            </Button>
          </form>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {copy.role}: {ROLE_LABEL_VI[claims.user_role]}
            </Badge>
            <Badge variant="outline">
              {copy.branch}: {branchName ?? copy.noBranch}
            </Badge>
          </div>
        }
      />

      <section className="flex flex-col gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold">
            {copy.primary.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy.primary.description}
          </p>
        </div>
        <PortalCardGrid cards={[primaryCard]} />
      </section>

      {appGroups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold">{group.title}</h2>
          <PortalCardGrid cards={group.items.map(discoveryToCard)} />
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold">
          {copy.groups.selfService}
        </h2>
        <PortalCardGrid cards={selfServiceCards} />
      </section>
    </AppPage>
  );
}
