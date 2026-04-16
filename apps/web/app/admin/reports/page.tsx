import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftRight,
  BookOpen,
  Briefcase,
  ClipboardList,
  Package,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";

interface ReportCardProps {
  title: string;
  description?: string;
  href: string;
  icon: React.ElementType;
  tone: "primary" | "success" | "info";
  badge: string;
}

function ReportCard({
  title,
  description,
  href,
  icon: Icon,
  tone,
  badge,
}: ReportCardProps) {
  const toneClassName =
    tone === "success"
      ? "bg-success/12 text-success"
      : tone === "info"
        ? "bg-info/12 text-info"
        : "bg-primary/10 text-primary";

  return (
    <Link
      href={href}
      className="rounded-lg border bg-muted/30 text-card-foreground group flex h-full flex-col justify-between p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex size-11 items-center justify-center rounded-2xl ${toneClassName}`}
          >
            <Icon className="size-5" />
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {badge}
          </Badge>
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight">{title}</p>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <span className="mt-5 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
        Mở báo cáo
      </span>
    </Link>
  );
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath());
  }

  const executiveCards: ReportCardProps[] = [
    {
      title: "Cockpit doanh thu",
      href: "/admin/reports/revenue",
      icon: TrendingUp,
      tone: "primary" as const,
      badge: "Điều hành lõi",
    },
    {
      title: "Giá trị tồn kho",
      href: "/admin/reports/inventory-value",
      icon: Package,
      tone: "info" as const,
      badge: "Điều hành lõi",
    },
  ];
  if (canAccess(claims.user_role, "finance")) {
    executiveCards.push({
      title: "Báo cáo tài chính",
      href: "/admin/finance/statements",
      icon: Wallet,
      tone: "success",
      badge: "Điều hành lõi",
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    executiveCards.push({
      title: "Toàn cảnh bảng lương",
      href: "/hr/payroll",
      icon: Briefcase,
      tone: "info",
      badge: "Điều hành lõi",
    });
  }

  const deepDiveCards: ReportCardProps[] = [
    {
      title: "Biến động tồn kho",
      href: "/admin/reports/stock-movement",
      icon: ArrowLeftRight,
      tone: "info" as const,
      badge: "Tín hiệu ops",
    },
  ];
  if (canAccess(claims.user_role, "finance")) {
    deepDiveCards.push({
      title: "Hệ thống tài khoản",
      href: "/admin/finance/chart-of-accounts",
      icon: BookOpen,
      tone: "success",
      badge: "Tuân thủ",
    });
    deepDiveCards.push({
      title: "Tài chính",
      href: "/admin/finance",
      icon: Receipt,
      tone: "success",
      badge: "Phân hệ",
    });
  }
  if (canAccess(claims.user_role, "inventory")) {
    deepDiveCards.push({
      title: "Kho",
      href: "/inventory/reports",
      icon: ClipboardList,
      tone: "info",
      badge: "Phân hệ",
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    deepDiveCards.push({
      title: "Nhân sự",
      href: "/hr",
      icon: ShieldCheck,
      tone: "info",
      badge: "Phân hệ",
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
                  Mỗi báo cáo và lối vào phân hệ nguồn giờ dùng cùng một grammar
                  bề mặt mới, thay cho cụm card cũ.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/dashboard">Về Admin</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/admin/settings">Mở nền tảng</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Báo cáo lõi</CardTitle>
            <p className="text-sm text-muted-foreground">
              Những góc nhìn tổng hợp nhất cho vận hành, doanh thu, tồn kho và
              tài chính.
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1.5">
            Điều hành
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {executiveCards.map((card) => (
              <ReportCard key={card.href} {...card} />
            ))}
          </div>
        </CardContent>
      </Card>

      {deepDiveCards.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Phân hệ nguồn</CardTitle>
              <p className="text-sm text-muted-foreground">
                Đi sâu từ báo cáo điều hành sang các nguồn dữ liệu và bề mặt
                chuyên môn.
              </p>
            </div>
            <Badge variant="info" className="rounded-full px-3 py-1.5">
              Phân hệ
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {deepDiveCards.map((card) => (
                <ReportCard key={card.href} {...card} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
