import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair as IconArmchair, ArrowLeft as IconArrowLeft, ArrowRight as IconArrowRight, Gauge as IconGauge, ListChecks as IconChecklist, Monitor as IconDeviceDesktop, LayoutGrid as IconLayoutGrid, Printer as IconPrinter, ReceiptText as IconReceipt2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";
import { loadAuthState } from "@/_lib/auth";

type Tile = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
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

  const isHq =
    branch.branch_kind === "central_warehouse" ||
    branch.branch_kind === "central_kitchen";

  const operationalTiles: Tile[] = [
    {
      href: `/br/${branchId}/settings/tables`,
      title: "Khu vực",
      description: "Khu vực ăn uống trong chi nhánh (Tầng 1, Sân vườn…).",
      icon: <IconLayoutGrid className="size-5" />,
    },
    {
      href: `/br/${branchId}/settings/tables`,
      title: "Bàn",
      description: "Danh sách bàn và sức chứa.",
      icon: <IconArmchair className="size-5" />,
    },
    {
      href: `/br/${branchId}/settings/pos`,
      title: "POS",
      description: "Máy POS đăng ký tại chi nhánh.",
      icon: <IconDeviceDesktop className="size-5" />,
    },
    {
      href: `/br/${branchId}/settings/pos-sessions`,
      title: "Ca POS",
      description: "Lịch sử ca, bill, doanh thu, số món và đối soát chênh lệch.",
      icon: <IconReceipt2 className="size-5" />,
    },
    {
      href: `/br/${branchId}/settings/printers`,
      title: "Máy in",
      description: "Hóa đơn, bếp 1, bếp 2 — cấu hình & trạng thái agent.",
      icon: <IconPrinter className="size-5" />,
    },
    {
      href: `/br/${branchId}/menu-limits`,
      title: "Hạn mức bán hàng ngày",
      description:
        "Đặt số phần tối đa mỗi món hôm nay (vd. 30 Sườn cốt lết) hoặc tắt món. Quản lý/POS/Bếp đều chỉnh được.",
      icon: <IconGauge className="size-5" />,
    },
  ];

  const tiles: Tile[] = [
    {
      href: "/menu",
      title: "Thực đơn",
      description: "Danh mục, món ăn, giá. (Áp dụng toàn hệ thống.)",
      icon: <IconChecklist className="size-5" />,
    },
    ...(isHq ? [] : operationalTiles),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href="/employee">
            <IconArrowLeft className="size-4" />
            Về Cổng
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Thiết lập chi nhánh</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {branch.name}
            {isHq ? " · Trụ sở (không dùng POS/Bàn/Máy in)" : ""}
          </p>
        </div>
      </div>

      {isHq ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <Badge variant="warning">Thông tin</Badge>
            <p className="text-sm text-muted-foreground">
              Chi nhánh trụ sở/kho trung tâm không áp dụng cấu hình Khu vực,
              Bàn, POS hay Máy in. Chỉ Thực đơn ở đây là có ý nghĩa.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Card
            key={`${tile.title}-${tile.href}`}
            className="rounded-lg border bg-muted/30 text-card-foreground"
          >
            <CardContent className="p-1">
              <Button
                asChild
                variant="ghost"
                className="group h-auto w-full justify-start rounded-2xl p-0"
              >
                <Link
                  href={tile.href}
                  className="flex min-h-16 w-full items-center gap-4 px-3 py-3"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {tile.icon}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {tile.title}
                    </p>
                    <p className="line-clamp-2 break-words text-sm leading-6 text-muted-foreground">
                      {tile.description}
                    </p>
                  </div>
                  <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
