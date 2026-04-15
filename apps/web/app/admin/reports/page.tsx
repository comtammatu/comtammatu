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
import { Button } from "@comtammatu/ui/components/button";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/patterns";

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
      className="group flex h-full flex-col justify-between rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex size-11 items-center justify-center rounded-lg ${toneClassName}`}
          >
            <Icon className="size-5" />
          </div>
          <StatusBadge tone="neutral" className="rounded-full px-3 py-1">
            {badge}
          </StatusBadge>
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
    <PageContainer>
      <PageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title="Báo cáo điều hành"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/dashboard">Về Admin</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/settings">Mở nền tảng</Link>
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Báo cáo lõi
            </h2>
          </div>
          <StatusBadge tone="neutral" className="rounded-full px-3 py-1.5">
            Điều hành
          </StatusBadge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {executiveCards.map((card) => (
            <ReportCard key={card.href} {...card} />
          ))}
        </div>
      </SectionCard>

      {deepDiveCards.length > 0 ? (
        <SectionCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Phân hệ nguồn
              </h2>
            </div>
            <StatusBadge tone="info" className="rounded-full px-3 py-1.5">
              Phân hệ
            </StatusBadge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deepDiveCards.map((card) => (
              <ReportCard key={card.href} {...card} />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
