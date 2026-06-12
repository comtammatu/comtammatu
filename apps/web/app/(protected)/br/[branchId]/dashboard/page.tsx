import { notFound } from "next/navigation";
import {
  Boxes as IconBoxes,
  ChefHat as IconChefHat,
  ClipboardList as IconClipboardList,
  Monitor as IconMonitor,
  MonitorUp as IconMonitorUp,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
import {
  AppLinkCard,
  AppPage,
  AppPageHeader,
  type AppLinkCardProps,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";

type BranchCommandTile = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: AppLinkCardProps["icon"];
};

export default async function BranchCommandPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const copy = messages.settings.branch;

  const tiles: BranchCommandTile[] = [
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings`,
      title: copy.commandBranchSetup,
      description: copy.commandBranchSetupDescription,
      icon: <IconSettings />,
    },
    {
      moduleKey: "pos",
      href: `/br/${branchId}/pos`,
      title: "POS",
      description: copy.commandPosDescription,
      icon: <IconMonitor />,
    },
    {
      moduleKey: "kds",
      href: `/br/${branchId}/kds`,
      title: "KDS",
      description: copy.commandKdsDescription,
      icon: <IconChefHat />,
    },
    {
      moduleKey: "runner",
      href: `/br/${branchId}/runner`,
      title: "Màn gọi số",
      description: copy.commandRunnerDescription,
      icon: <IconMonitorUp />,
    },
    {
      moduleKey: "branch_menu_limits",
      href: `/br/${branchId}/menu-limits`,
      title: copy.menuLimitsTitle,
      description: copy.commandMenuLimitsDescription,
      icon: <IconUtensils />,
    },
    {
      moduleKey: "orders",
      href: `/orders?branchId=${branchId}`,
      title: "Đơn hàng",
      description: copy.commandOrdersDescription,
      icon: <IconClipboardList />,
    },
    {
      moduleKey: "hr",
      href: "/hr",
      title: "Nhân sự",
      description: copy.commandHrDescription,
      icon: <IconUsers />,
    },
    {
      moduleKey: "inventory",
      href: `/inventory?branchId=${branchId}`,
      title: "Kho hàng",
      description: copy.commandInventoryDescription,
      icon: <IconBoxes />,
    },
  ];

  const visibleTiles = tiles.filter((tile) =>
    canAccess(claims.user_role, tile.moduleKey),
  );

  return (
    <AppPage width="default" className="md:p-6">
      <AppPageHeader
        eyebrow="Theo chi nhánh"
        title={copy.commandTitle}
        description={copy.commandDescription(branch.name)}
        badge={{
          children: branch.name,
          variant: "secondary",
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {visibleTiles.map((tile) => (
          <AppLinkCard
            key={`${tile.moduleKey}-${tile.href}`}
            href={tile.href}
            title={tile.title}
            description={tile.description}
            icon={tile.icon}
            ctaLabel="Mở"
          />
        ))}
      </div>
    </AppPage>
  );
}
