import {
  ArrowRight,
  Building2,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { LoginForm } from "./login-form";

function BrandPanel() {
  return (
    <section className="surface-shell paper-grid-dark order-2 overflow-hidden p-6 lg:order-1 lg:min-h-dvh">
      <div className="flex h-full flex-col justify-between gap-8">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/70">
            <Sparkles className="size-3.5" />
            Hệ điều hành nhà hàng
          </div>

          <div className="space-y-4">
            <div className="flex size-16 items-center justify-center rounded-full border border-white/12 bg-sidebar-primary text-sidebar-primary-foreground">
              <UtensilsCrossed className="size-7" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                Đăng nhập theo vai trò
              </p>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-sidebar-foreground sm:text-5xl">
                Vào đúng nhịp vận hành ngay từ màn hình đầu tiên.
              </h1>
              <p className="max-w-xl text-sm leading-7 text-sidebar-foreground/72 sm:text-base">
                Một lớp giao diện mới cho quản trị, kho hàng, nhân sự, POS và
                KDS, nhưng vẫn giữ nguyên route, phân quyền và logic nghiệp vụ.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Bán hàng
            </p>
            <p className="mt-2 text-lg font-semibold text-sidebar-foreground">
              POS và KDS
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Kho hàng
            </p>
            <p className="mt-2 text-lg font-semibold text-sidebar-foreground">
              Nhập, nhận, tồn
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Nhân sự
            </p>
            <p className="mt-2 text-lg font-semibold text-sidebar-foreground">
              Ca làm và lương
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustRow() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="surface-panel px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-secondary text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Đăng nhập an toàn</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Điều hướng đúng quyền ngay sau khi xác thực.
            </p>
          </div>
        </div>
      </div>
      <div className="surface-panel px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-secondary text-primary">
            <Building2 className="size-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Đúng site vận hành</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Giữ nguyên ngữ cảnh chi nhánh và tuyến nghiệp vụ hiện có.
            </p>
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
    <main id="main-content" className="min-h-dvh px-3 py-3 sm:px-4 lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-2 lg:items-stretch">
        <BrandPanel />

        <section className="order-1 flex lg:order-2 lg:items-center">
          <div className="w-full space-y-4">
            <div className="surface-panel-strong overflow-hidden p-6 sm:p-7">
              <div className="flex flex-col gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex size-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground">
                      <UtensilsCrossed className="size-6" />
                    </div>
                    <span className="ops-chip">Cổng nhân viên</span>
                  </div>
                  <div className="space-y-2">
                    <p className="ops-kicker">Đăng nhập cổng nhân viên</p>
                    <h2 className="text-4xl font-semibold tracking-tight text-foreground">
                      Sẵn sàng vào ca, đúng vai trò
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                      Giao diện mới, hành động rõ hơn, nhưng không thay đổi luồng
                      quyền hay đường dẫn đang vận hành.
                    </p>
                  </div>
                </div>

                <LoginForm returnTo={sp.returnTo} />
              </div>
            </div>

            <TrustRow />

            <p className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <ArrowRight className="size-3.5" />
              2026 Cơm Tấm Má Tư CTCP
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
