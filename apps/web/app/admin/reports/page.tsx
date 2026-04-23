import Link from "next/link";
import {
  IconArrowLeftRight,
  IconBook,
  IconBriefcase,
  IconClipboardList,
  IconPackage,
  IconReceipt,
  IconShieldCheck,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { canAccess } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "../../components/surface-link-card";

export default async function ReportsPage() {
  const { claims } = await loadAuthState();

  const executiveCards: SurfaceLinkCardProps[] = [
    {
      title: "Doanh thu",
      href: "/admin/reports/revenue",
      icon: IconTrendingUp,
      tone: "primary" as const,
      badge: "Tổng hợp",
    },
    {
      title: "Giá trị tồn kho",
      href: "/admin/reports/inventory-value",
      icon: IconPackage,
      tone: "info" as const,
      badge: "Tổng hợp",
    },
  ];
  if (canAccess(claims.user_role, "finance")) {
    executiveCards.push({
      title: "Báo cáo tài chính",
      href: "/finance/statements",
      icon: IconWallet,
      tone: "success",
      badge: "Tổng hợp",
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    executiveCards.push({
      title: "Toàn cảnh bảng lương",
      href: "/hr/payroll",
      icon: IconBriefcase,
      tone: "info",
      badge: "Tổng hợp",
    });
  }

  const deepDiveCards: SurfaceLinkCardProps[] = [
    {
      title: "Biến động tồn kho",
      href: "/admin/reports/stock-movement",
      icon: IconArrowLeftRight,
      tone: "info" as const,
      badge: "Vận hành",
    },
  ];
  if (canAccess(claims.user_role, "finance")) {
    deepDiveCards.push({
      title: "Hệ thống tài khoản",
      href: "/finance/chart-of-accounts",
      icon: IconBook,
      tone: "success",
      badge: "Kế toán",
    });
    deepDiveCards.push({
      title: "Tài chính",
      href: "/finance",
      icon: IconReceipt,
      tone: "success",
      badge: "Chi tiết",
    });
  }
  if (canAccess(claims.user_role, "inventory")) {
    deepDiveCards.push({
      title: "Kho",
      href: "/inventory/reports",
      icon: IconClipboardList,
      tone: "info",
      badge: "Chi tiết",
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    deepDiveCards.push({
      title: "Nhân sự",
      href: "/hr",
      icon: IconShieldCheck,
      tone: "info",
      badge: "Chi tiết",
    });
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {APP_COPY_VI.executiveReporting}
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Báo cáo điều hành
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Xem nhanh các báo cáo quan trọng về doanh thu, tồn kho, tài
                  chính và tiền lương.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/dashboard">Về Admin</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/admin/settings">Mở cài đặt</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
              <CardTitle>Báo cáo tổng hợp</CardTitle>
              <p className="text-sm text-muted-foreground">
                Các chỉ số quan trọng cho doanh thu, tồn kho, tài chính và
                lương.
              </p>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1.5">
            Điều hành
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {executiveCards.map((card) => (
              <SurfaceLinkCard
                key={card.href}
                {...card}
                ctaLabel="Mở báo cáo"
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {deepDiveCards.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Mở nhanh mục liên quan</CardTitle>
              <p className="text-sm text-muted-foreground">
                Đi từ báo cáo sang các mục liên quan để xem chi tiết và xử lý
                công việc.
              </p>
            </div>
            <Badge variant="info" className="rounded-full px-3 py-1.5">
              Chi tiết
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {deepDiveCards.map((card) => (
                <SurfaceLinkCard
                  key={card.href}
                  {...card}
                  ctaLabel="Mở báo cáo"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
