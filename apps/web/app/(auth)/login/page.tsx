import { Suspense } from "react";
import { Building2, ShieldCheck, UtensilsCrossed } from "lucide-react";
import {
  getSurfacePanelClassName,
  getSurfaceShellClassName,
} from "@comtammatu/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { SearchParamBlockedStateFlash } from "@/components/foundation/blocked-state-flash";
import { LoginForm } from "./login-form";

function BrandPanel() {
  return (
    <section className="ui-login-brand-panel order-2 lg:order-1">
      <div className="relative flex h-full flex-col justify-between gap-6 ui-stagger-children">
        <div className="space-y-5">
          <Badge
            variant="outline"
            className="w-fit border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/78"
          >
            Cổng nhân viên
          </Badge>
          <div className="flex size-14 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/10 shadow-xl shadow-black/10">
            <UtensilsCrossed className="size-7 text-white" />
          </div>
          <div className="space-y-3">
            <h2 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-balance xl:text-5xl">
              Vào đúng nơi làm việc, thật nhanh.
            </h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/8 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/55">
              Bán hàng
            </p>
            <p className="mt-1.5 text-lg font-semibold">POS và KDS</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/8 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/55">
              Kho hàng
            </p>
            <p className="mt-1.5 text-lg font-semibold">Nhập, xuất, tồn</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/8 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/55">
              Nhân sự
            </p>
            <p className="mt-1.5 text-lg font-semibold">Ca làm và lương</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustRow() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:gap-3">
          <div className="rounded-2xl border border-border/70 bg-white/78 p-3.5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Đăng nhập an toàn</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-white/78 p-3.5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-2xl bg-success/10 text-success">
                <Building2 className="size-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Đúng chi nhánh</p>
              </div>
            </div>
          </div>
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
      className={getSurfaceShellClassName(
        "auth",
        "relative overflow-hidden min-h-dvh px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-5",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(211,84,0,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(44,105,78,0.08),transparent_22%)]"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5 lg:grid lg:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-center xl:min-h-[calc(100dvh-3rem)]">
        <BrandPanel />

        <section className="order-1 flex lg:order-2 lg:items-center lg:justify-end">
          <div className="w-full space-y-3 lg:max-w-2xl">
            <Card
              className={getSurfacePanelClassName(
                "auth",
                "ui-surface-lift shadow-lg shadow-primary/10",
              )}
            >
              <CardHeader className="space-y-3 pb-4 md:pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex size-12 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
                    <UtensilsCrossed className="size-6" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary"
                  >
                    Cổng nhân viên
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="app-section-label">Đăng nhập cổng nhân viên</p>
                  <CardTitle className="text-[clamp(1.85rem,2.8vw,2.35rem)] font-semibold tracking-tight">
                    Vào ca nhanh, đúng vai trò
                  </CardTitle>
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

            <p className="px-1 text-xs text-muted-foreground">
              2026 Cơm Tấm Má Tư CTCP
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
