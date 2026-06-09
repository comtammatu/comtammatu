import Link from "next/link";
import {
  ArrowLeftRight as IconArrowLeftRight,
  Book as IconBook,
  ClipboardList as IconClipboardList,
  Package as IconPackage,
  Receipt as IconReceipt,
  ShieldCheck as IconShieldCheck,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title="Báo cáo điều hành"
        description="Xem nhanh các báo cáo quan trọng về doanh thu, tồn kho, tài chính và ngày công."
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

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Báo cáo tổng hợp
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Các chỉ số quan trọng cho doanh thu, tồn kho, tài chính và ngày
            công.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {executiveCards.map((card) => (
            <SurfaceLinkCard key={card.href} {...card} ctaLabel="Mở báo cáo" />
          ))}
        </div>
      </section>

      {deepDiveCards.length > 0 ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Mở nhanh mục liên quan
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Đi từ báo cáo sang các mục liên quan để xem chi tiết và xử lý công
              việc.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {deepDiveCards.map((card) => (
              <SurfaceLinkCard
                key={card.href}
                {...card}
                ctaLabel="Mở báo cáo"
              />
            ))}
          </div>
        </section>
      ) : null}
    </AppPage>
  );
}
