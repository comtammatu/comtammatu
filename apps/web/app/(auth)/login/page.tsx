import { Suspense } from "react";
import { Building2, ShieldCheck, UtensilsCrossed } from "lucide-react";
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
    <Card className="order-2 border-border/80 lg:order-1 lg:h-full">
      <CardHeader className="space-y-5">
        <Badge variant="secondary" className="w-fit">
          Cổng nhân viên
        </Badge>
        <div className="flex size-14 items-center justify-center rounded-full border bg-primary/10 text-primary">
          <UtensilsCrossed className="size-7" />
        </div>
        <div className="space-y-2">
          <CardTitle className="max-w-lg text-3xl leading-tight sm:text-4xl">
            Vào đúng nơi làm việc, thật nhanh.
          </CardTitle>
          <CardDescription className="max-w-lg leading-6">
            Một giao diện thống nhất cho bán hàng, kho vận và nhân sự.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
        <Card className="shadow-none">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Bán hàng
            </p>
            <p className="mt-1.5 text-lg font-semibold">POS và KDS</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Kho hàng
            </p>
            <p className="mt-1.5 text-lg font-semibold">Nhập, xuất, tồn</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-4">
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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-full border bg-primary/10 text-primary">
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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-full border bg-success/10 text-success">
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
      className="min-h-dvh bg-background px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-5"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-center">
        <BrandPanel />

        <section className="order-1 flex lg:order-2 lg:items-center lg:justify-end">
          <div className="w-full space-y-3 lg:max-w-2xl">
            <Card>
              <CardHeader className="space-y-3 pb-4 md:pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full border bg-primary text-primary-foreground">
                    <UtensilsCrossed className="size-6" />
                  </div>
                  <Badge variant="secondary">
                    Cổng nhân viên
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Đăng nhập cổng nhân viên
                  </p>
                  <CardTitle className="text-3xl sm:text-4xl">
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
