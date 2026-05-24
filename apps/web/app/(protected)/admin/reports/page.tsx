import Link from "next/link";
import { ArrowLeftRight as IconArrowLeftRight, Book as IconBook, Briefcase as IconBriefcase, ClipboardList as IconClipboardList, Package as IconPackage, Receipt as IconReceipt, ShieldCheck as IconShieldCheck, TrendingUp as IconTrendingUp, Wallet as IconWallet } from "lucide-react";
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
import { AppPage, AppPageHeader } from "@/components/surface";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "@/components/surface-link-card";

export default async function ReportsPage() {
  const { claims } = await loadAuthState();

  const executiveCards: SurfaceLinkCardProps[] = [
    {
      title: "Doanh thu",
      href: "/admin/reports/revenue",
      icon: <IconTrendingUp />,
      tone: "primary" as const,
      badge: "Tổng hợp",
    },
    {
      title: "Giá trị tồn kho",
      href: "/admin/reports/inventory-value",
      icon: <IconPackage />,
      tone: "info" as const,
      badge: "Tổng hợp",
    },
  ];
  if (canAccess(claims.user_role, "finance")) {
    executiveCards.push({
      title: "Báo cáo tài chính",
      href: "/finance/statements",
      icon: <IconWallet />,
      tone: "success",
      badge: "Tổng hợp",
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    executiveCards.push({
      title: "Toàn cảnh bảng lương",
      href: "/hr/payroll",
      icon: <IconBriefcase />,
      tone: "info",
      badge: "Tổng hợp",
    });
  }

  const deepDiveCards: SurfaceLinkCardProps[] = [
    {
      title: "Biến động tồn kho",
      href: "/admin/reports/stock-movement",
      icon: <IconArrowLeftRight />,
      tone: "info" as const,
      badge: "Vận hành",
    },
  ];
  if (canAccess(claims.user_role, "finance")) {
    deepDiveCards.push({
      title: "Hệ thống tài khoản",
      href: "/finance/chart-of-accounts",
      icon: <IconBook />,
      tone: "success",
      badge: "Kế toán",
    });
    deepDiveCards.push({
      title: "Tài chính",
      href: "/finance",
      icon: <IconReceipt />,
      tone: "success",
      badge: "Chi tiết",
    });
  }
  if (canAccess(claims.user_role, "inventory")) {
    deepDiveCards.push({
      title: "Kho",
      href: "/inventory/reports",
      icon: <IconClipboardList />,
      tone: "info",
      badge: "Chi tiết",
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    deepDiveCards.push({
      title: "Nhân sự",
      href: "/hr",
      icon: <IconShieldCheck />,
      tone: "info",
      badge: "Chi tiết",
    });
  }

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title="Báo cáo điều hành"
        description="Xem nhanh các báo cáo quan trọng về doanh thu, tồn kho, tài chính và tiền lương."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/dashboard">Về Admin</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/settings">Mở cài đặt</Link>
            </Button>
          </>
        }
      />

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
    </AppPage>
  );
}
