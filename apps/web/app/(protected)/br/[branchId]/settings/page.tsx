import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Armchair as IconArmchair,
  ArrowLeft as IconArrowLeft,
  ChefHat as IconChefHat,
  Gauge as IconGauge,
  ListChecks as IconChecklist,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
  ReceiptText as IconReceipt2,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppLinkCard, AppPage, AppPageHeader } from "@/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { AttendanceSettingsCard } from "./attendance-settings-card";

type Tile = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
};

export default async function BranchSettingsHubPage({
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

  const canEnterEmployeePortal = canAccess(claims.user_role, "employee");
  const backHref =
    claims.user_role === "branch_manager"
      ? `/br/${branchId}/dashboard`
      : canEnterEmployeePortal
        ? "/employee"
        : "/admin/dashboard";
  const backLabel =
    claims.user_role === "branch_manager"
      ? APP_COPY_VI.branchCommand
      : canEnterEmployeePortal
        ? messages.settings.branch.employeeBack
        : APP_COPY_VI.adminSurface;

  const operationalTiles: Tile[] = [
    {
      href: `/br/${branchId}/settings/tables`,
      title: "Bàn & khu vực",
      description: "Khu vực ăn uống (Tầng 1, Sân vườn…), danh sách bàn và trạng thái.",
      icon: <IconArmchair />,
    },
    {
      href: `/br/${branchId}/settings/pos`,
      title: "POS",
      description: "Máy POS đăng ký tại chi nhánh.",
      icon: <IconDeviceDesktop />,
    },
    {
      href: `/br/${branchId}/settings/pos-sessions`,
      title: "Ca POS",
      description:
        "Lịch sử ca, bill, doanh thu, số món và đối soát chênh lệch.",
      icon: <IconReceipt2 />,
    },
    {
      href: `/br/${branchId}/settings/printers`,
      title: "Máy in",
      description: "Hóa đơn, bếp 1, bếp 2 — cấu hình & trạng thái agent.",
      icon: <IconPrinter />,
    },
    {
      href: `/br/${branchId}/settings/kds`,
      title: "Trạm bếp (KDS)",
      description: "Trạm hiển thị bếp và gán danh mục món ăn cho từng trạm.",
      icon: <IconChefHat />,
    },
    {
      href: `/br/${branchId}/menu-limits`,
      title: "Hạn mức bán hàng ngày",
      description:
        "Đặt số phần tối đa mỗi món hôm nay (vd. 30 Sườn cốt lết) hoặc tắt món. Quản lý/POS/Bếp đều chỉnh được.",
      icon: <IconGauge />,
    },
  ];

  const tiles: Tile[] = [
    {
      href: "/menu",
      title: "Thực đơn",
      description: "Danh mục, món ăn, giá. (Áp dụng toàn hệ thống.)",
      icon: <IconChecklist />,
    },
    ...operationalTiles,
  ];

  return (
    <AppPage width="default" className="md:p-6">
      <AppPageHeader
        title={messages.settings.branch.hubTitle}
        description={messages.settings.branch.hubDescription(branch.name)}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={backHref}>
              <IconArrowLeft className="size-4" />
              {backLabel}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <AttendanceSettingsCard
          branch={{
            id: branch.id,
            name: branch.name,
          }}
        />
        {tiles.map((tile) => (
          <AppLinkCard
            key={`${tile.title}-${tile.href}`}
            href={tile.href}
            title={tile.title}
            description={tile.description}
            icon={tile.icon}
          />
        ))}
      </div>
    </AppPage>
  );
}
