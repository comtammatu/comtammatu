import { Suspense } from "react";
import {
  ArrowRight,
  Building2,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { SearchParamBlockedStateFlash } from "@/components/foundation/blocked-state-flash";
import { LoginForm } from "./login-form";

function BrandPanel() {
  return (
    <Card className="order-2 rounded-4xl border-border/80 bg-card shadow-app-md lg:order-1 lg:h-full">
      <CardHeader className="space-y-6">
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          Restaurant Ops OS
        </Badge>
        <div className="flex size-16 items-center justify-center rounded-3xl border border-border/70 bg-panel-subtle text-primary">
          <UtensilsCrossed className="size-7" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đăng nhập theo vai trò
          </p>
          <CardTitle className="max-w-lg text-3xl leading-tight sm:text-5xl">
            Vào đúng không gian vận hành, thật nhanh.
          </CardTitle>
          <CardDescription className="max-w-lg leading-6">
            Một bề mặt điều phối mới cho bán hàng, kho vận và nhân sự, vẫn giữ
            nguyên quyền hạn và nghiệp vụ hiện có.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
        <Card className="rounded-3xl border-border/70 bg-panel-subtle shadow-none">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Bán hàng
            </p>
            <p className="mt-1.5 text-lg font-semibold">POS và KDS</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-border/70 bg-panel-subtle shadow-none">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Kho hàng
            </p>
            <p className="mt-1.5 text-lg font-semibold">Nhập, xuất, tồn</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-border/70 bg-panel-subtle shadow-none">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nhân sự
            </p>
            <p className="mt-1.5 text-lg font-semibold">Ca làm và lương</p>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

function TrustRow() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:gap-3">
      <Card className="rounded-4xl border-border/80 bg-card shadow-app-sm">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-panel-subtle text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Đăng nhập an toàn</p>
              <p className="text-sm text-muted-foreground">
                Điều hướng đúng vai trò sau khi xác thực.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-4xl border-border/80 bg-card shadow-app-sm">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-success/10 text-success">
              <Building2 className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Đúng chi nhánh</p>
              <p className="text-sm text-muted-foreground">
                Giữ nguyên phân quyền và ngữ cảnh vận hành hiện có.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main
      id="main-content"
      className="min-h-dvh bg-background px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-6"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-center">
        <BrandPanel />

        <section className="order-1 flex lg:order-2 lg:items-center lg:justify-end">
          <div className="w-full space-y-3 lg:max-w-2xl">
            <Card className="rounded-4xl border-border/80 bg-card shadow-app-md">
              <CardHeader className="space-y-4 pb-4 md:pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex size-14 items-center justify-center rounded-3xl border border-border/70 bg-primary text-primary-foreground">
                    <UtensilsCrossed className="size-6" />
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    Cổng nhân viên
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Đăng nhập cổng nhân viên
                  </p>
                  <CardTitle className="text-3xl sm:text-4xl">
                    Sẵn sàng vào ca, đúng vai trò
                  </CardTitle>
                  <CardDescription>
                    Giữ nguyên phân quyền, route và toàn bộ nghiệp vụ hiện có
                    trong một bề mặt V2 thống nhất.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <Suspense fallback={null}>
                  <SearchParamBlockedStateFlash autoClear mode="inline" />
                </Suspense>
                <LoginForm returnTo={sp.returnTo} />
              </CardContent>
            </Card>

            <TrustRow />

            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <ArrowRight className="size-3.5" />
              2026 Cơm Tấm Má Tư CTCP
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
