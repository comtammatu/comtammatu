import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Boxes,
  BriefcaseBusiness,
  LayoutDashboard,
  Monitor,
  UserSquare2,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  ROLE_LABEL_VI,
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
  resolveBlockedState,
} from "@comtammatu/shared/auth";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HubCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export default async function BetaHubPage({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string; reason?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/beta/login");
  }

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath("missing-auth-context", { surface: "beta" }));
  }

  const sp = await searchParams;
  const blockedState = sp.forbidden === "1" ? resolveBlockedState(sp.reason) : null;

  const supportedCards: HubCard[] = [
    canAccess(claims.user_role, "dashboard")
      ? {
          href: "/beta/admin/dashboard",
          title: "Điều hành quản trị",
          description: "Dashboard và route quản trị trong cây beta.",
          icon: LayoutDashboard,
        }
      : null,
    canAccess(claims.user_role, "inventory")
      ? {
          href: "/beta/inventory",
          title: "Kho vận",
          description: "Surface kho beta với dữ liệu thật và route mirror.",
          icon: Boxes,
        }
      : null,
  ].filter((card): card is HubCard => card !== null);

  const branchUnsupported = claims.branch_id
    ? [
        {
          href: `/beta/br/${claims.branch_id}/pos`,
          title: "POS beta",
          description: "Notice route cho POS trong giai đoạn này.",
          icon: Monitor,
        },
      ]
    : [];

  const unsupportedCards = [
    {
      href: "/beta/employee",
      title: "Cổng nhân viên beta",
      description: "Entry beta cho employee surface chưa vào phase 1.",
      icon: UserSquare2,
    },
    {
      href: "/beta/hr",
      title: "Nhân sự beta",
      description: "Entry beta cho workspace nhân sự ngoài phạm vi phase 1.",
      icon: BriefcaseBusiness,
    },
    ...branchUnsupported,
  ];

  return (
    <main id="main-content" className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Beta hub</Badge>
              <Badge variant="outline">{ROLE_LABEL_VI[claims.user_role]}</Badge>
            </div>
            <CardTitle>Chọn surface beta</CardTitle>
            <CardDescription>
              Hub này giữ bạn ở trong cây `/beta/*` khi route đích đã hỗ trợ hoặc khi một surface
              khác vẫn đang ở notice mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blockedState ? (
              <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{blockedState.copy.title}</p>
                <p>
                  {blockedState.copy.description} {blockedState.copy.nextStep}
                </p>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Tenant #{claims.tenant_id}
              {claims.branch_id !== null ? ` • Chi nhánh #${claims.branch_id}` : " • Cấp tenant"}
            </p>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "default" })}>
              Về app hiện tại
              <ArrowUpRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Các surface đã hỗ trợ</CardTitle>
                <CardDescription>Login, admin và inventory trong phase 1.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {supportedCards.map((card) => (
                  <Card key={card.href} size="sm">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <card.icon className="size-4" />
                        <CardTitle>{card.title}</CardTitle>
                      </div>
                      <CardDescription>{card.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Link
                        href={card.href}
                        className={buttonVariants({ variant: "default", size: "default" })}
                      >
                        Mở beta
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notice routes</CardTitle>
              <CardDescription>Các surface ngoài phase 1 vẫn có entry beta riêng.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {unsupportedCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "default" }),
                    "w-full justify-between",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <card.icon className="size-4" />
                    <span>{card.title}</span>
                  </span>
                  <ArrowUpRight className="size-4" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
