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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const blockedState =
    sp.forbidden === "1" ? resolveBlockedState(sp.reason) : null;

  const supportedCards: HubCard[] = [
    canAccess(claims.user_role, "dashboard")
      ? {
          href: "/beta/admin/dashboard",
          title: "Điều hành quản trị",
          description: "Dashboard và route quản trị trong shell beta mới.",
          icon: LayoutDashboard,
        }
      : null,
    canAccess(claims.user_role, "inventory")
      ? {
          href: "/beta/inventory",
          title: "Kho vận",
          description: "Bề mặt kho beta với dữ liệu thật, cảnh báo và route mirror.",
          icon: Boxes,
        }
      : null,
  ].filter((card): card is HubCard => card !== null);

  const branchUnsupported = claims.branch_id
    ? [
        {
          href: `/beta/br/${claims.branch_id}/pos`,
          title: "POS beta",
          description: "Notice beta cho bề mặt POS trước khi workflow được chuyển trọn.",
          icon: Monitor,
        },
      ]
    : [];

  const unsupportedCards = [
    {
      href: "/beta/employee",
      title: "Cổng nhân viên beta",
      description: "Điểm vào notice cho employee surface chưa vào phase 1.",
      icon: UserSquare2,
    },
    {
      href: "/beta/hr",
      title: "Nhân sự beta",
      description: "Điểm vào notice cho workspace nhân sự ngoài phạm vi phase 1.",
      icon: BriefcaseBusiness,
    },
    ...branchUnsupported,
  ];

  return (
    <main
      id="main-content"
      data-beta-ui
      className="beta-ledger-grid min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5"
    >
      <div className="mx-auto max-w-screen-2xl space-y-5">
        <section className="beta-paper beta-grain overflow-hidden p-6 sm:p-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_23rem]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 uppercase tracking-widest">
                  Beta hub
                </Badge>
                <Badge variant="secondary" className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                  {ROLE_LABEL_VI[claims.user_role]}
                </Badge>
              </div>
              <div className="space-y-3">
                <h1 className="font-heading text-6xl leading-none tracking-tight text-foreground">
                  Chọn bề mặt beta để tiếp tục làm việc.
                </h1>
                <p className="max-w-3xl text-base leading-8 text-muted-foreground">
                  Hub này giữ bạn ở trong beta khi route yêu cầu chưa được chuyển trọn. Tất cả quyền truy cập vẫn bám đúng vào ACL, role và branch context hiện có.
                </p>
              </div>
              {blockedState ? (
                <div className="rounded-4xl border border-warning/20 bg-warning/10 px-5 py-4">
                  <p className="text-xs uppercase tracking-widest text-warning">
                    {blockedState.copy.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {blockedState.copy.description} {blockedState.copy.nextStep}
                  </p>
                </div>
              ) : null}
            </div>

            <Card className="border-border/60 bg-sidebar text-sidebar-foreground">
              <CardHeader>
                <CardTitle className="font-heading text-4xl text-sidebar-foreground">
                  Ngữ cảnh phiên
                </CardTitle>
                <CardDescription className="text-sidebar-foreground/72">
                  Tenant #{claims.tenant_id}
                  {claims.branch_id !== null ? ` • Chi nhánh #${claims.branch_id}` : " • Cấp tenant"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-sidebar-foreground/74">
                <p>
                  Beta phase 1 hiện hỗ trợ <strong className="text-sidebar-foreground">Login</strong>, <strong className="text-sidebar-foreground">Admin</strong> và <strong className="text-sidebar-foreground">Inventory</strong>. Các bề mặt khác sẽ mở vào notice page để bạn không bị mất hướng.
                </p>
                <Button
                  asChild
                  variant="secondary"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 text-sidebar-foreground hover:bg-white/16"
                >
                  <Link href="/">
                    Về app hiện tại
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_24rem]">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Supported now
              </p>
              <h2 className="mt-2 font-heading text-4xl text-foreground">
                Các bề mặt đã vào phase 1
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {supportedCards.map((card) => (
                <Card key={card.href} className="border-border/60 bg-card/90">
                  <CardHeader className="space-y-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <card.icon className="size-5" />
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="font-heading text-3xl">{card.title}</CardTitle>
                      <CardDescription className="text-base leading-7">
                        {card.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button asChild className="h-11 rounded-2xl px-5">
                      <Link href={card.href}>
                        Mở beta
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="border-border/60 bg-card/90">
            <CardHeader>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Outside phase 1
              </p>
              <CardTitle className="font-heading text-4xl">Notice routes</CardTitle>
              <CardDescription className="text-base leading-7">
                Những bề mặt này chưa được chuyển trọn nhưng đã có lối vào beta riêng để bạn không đụng 404 thô.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {unsupportedCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="flex items-center gap-3 rounded-3xl border border-border/60 bg-background/75 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <card.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{card.title}</span>
                    <span className="block text-sm leading-6 text-muted-foreground">
                      {card.description}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
