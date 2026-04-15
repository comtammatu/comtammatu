import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, LockKeyhole, UtensilsCrossed } from "lucide-react";
import { resolveBlockedState } from "@comtammatu/shared/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BetaLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Beta Login | Cơm Tấm Má Tư",
};

export default async function BetaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    forbidden?: string;
    reason?: string;
  }>;
}) {
  const sp = await searchParams;
  const blockedState =
    sp.forbidden === "1" ? resolveBlockedState(sp.reason) : null;

  return (
    <main
      id="main-content"
      data-beta-ui
      className="beta-ledger-grid min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5"
    >
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-screen-2xl gap-4 lg:grid-cols-[minmax(0,1.15fr)_34rem]">
        <section className="beta-shell beta-grain flex flex-col justify-between overflow-hidden p-6 sm:p-8">
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="secondary"
                className="rounded-full border border-white/10 bg-white/10 px-4 py-1 text-sidebar-foreground"
              >
                Cơm Tấm Má Tư
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-white/12 bg-transparent px-4 py-1 text-sidebar-foreground"
              >
                Beta surface
              </Badge>
            </div>

            <div className="space-y-4">
              <p className="text-sm uppercase tracking-widest text-sidebar-foreground/48">
                Editorial industrial frontend
              </p>
              <h1 className="max-w-4xl font-heading text-6xl leading-[0.92] tracking-tight text-sidebar-foreground sm:text-7xl">
                Một mặt vận hành mới, sắc hơn, vẫn dùng cùng dữ liệu thật.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-sidebar-foreground/70">
                Beta được xây như một surface song song: login, quản trị và kho hàng có shell mới, điều hướng mới, nhưng vẫn bám đúng auth, ACL và nghiệp vụ hiện có.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: LockKeyhole,
                  title: "Quyền giữ nguyên",
                  description: "Proxy và ACL vẫn là nơi quyết định truy cập.",
                },
                {
                  icon: Building2,
                  title: "Đúng ngữ cảnh",
                  description: "Không làm trôi tenant, chi nhánh hay role đang có.",
                },
                {
                  icon: UtensilsCrossed,
                  title: "Tối ưu cho vận hành",
                  description: "Nhấn mạnh tín hiệu và nhịp công việc hơn là chrome.",
                },
              ].map((item) => (
                <Card
                  key={item.title}
                  className="border-white/10 bg-white/8 text-sidebar-foreground"
                >
                  <CardContent className="space-y-4 p-5">
                    <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                      <item.icon className="size-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-sidebar-foreground">{item.title}</p>
                      <p className="text-sm leading-6 text-sidebar-foreground/68">
                        {item.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3 text-sm text-sidebar-foreground/66">
            <span>Legacy vẫn chạy song song</span>
            <Button
              asChild
              variant="ghost"
              className="rounded-full border border-white/10 bg-white/8 text-sidebar-foreground hover:bg-white/12"
            >
              <Link href="/login">
                Mở login hiện tại
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="beta-paper flex items-center p-5 sm:p-6">
          <div className="w-full space-y-5">
            <div className="space-y-3">
              <Badge variant="outline" className="rounded-full px-3 py-1 uppercase tracking-widest">
                Beta auth
              </Badge>
              <div>
                <h2 className="font-heading text-5xl leading-none tracking-tight text-foreground">
                  Đăng nhập để vào đúng nhịp làm việc
                </h2>
                <p className="mt-3 text-base leading-7 text-muted-foreground">
                  Nếu bạn đi vào beta từ một route cụ thể, hệ thống sẽ cố giữ bạn ở đúng ngữ cảnh đó sau khi xác thực.
                </p>
              </div>
            </div>

            {blockedState ? (
              <div className="rounded-4xl border border-warning/20 bg-warning/10 px-5 py-4">
                <p className="text-xs uppercase tracking-widest text-warning">
                  {blockedState.copy.tone === "danger" ? "Phiên chưa hợp lệ" : "Truy cập bị chặn"}
                </p>
                <p className="mt-2 text-lg font-medium text-foreground">
                  {blockedState.copy.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {blockedState.copy.description} {blockedState.copy.nextStep}
                </p>
              </div>
            ) : null}

            <BetaLoginForm returnTo={sp.returnTo} />
          </div>
        </section>
      </div>
    </main>
  );
}
