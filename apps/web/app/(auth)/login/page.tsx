import {
  ArrowRight,
  Building2,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { LoginForm } from "./login-form";

function BrandPanel() {
  return (
    <Card className="order-2 bg-sidebar text-sidebar-foreground lg:order-1">
      <CardContent className="flex h-full flex-col justify-between gap-8 p-6">
        <div className="space-y-6">
          <Badge variant="outline" className="border-sidebar-border text-sidebar-foreground/70">
            Hệ điều hành nhà hàng
          </Badge>
          <div className="space-y-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
              <UtensilsCrossed className="size-6" />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                Đăng nhập theo vai trò
              </p>
              <h1 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
                Vào đúng nhịp vận hành ngay từ màn hình đầu tiên.
              </h1>
              <p className="max-w-xl text-sm leading-7 text-sidebar-foreground/70">
                Một lớp giao diện mới cho quản trị, kho hàng, nhân sự, POS và
                KDS, nhưng vẫn giữ nguyên route, phân quyền và logic nghiệp vụ.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Bán hàng", value: "POS và KDS" },
            { label: "Kho hàng", value: "Nhập, nhận, tồn" },
            { label: "Nhân sự", value: "Ca làm và lương" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-sidebar-border bg-sidebar-accent p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                {item.label}
              </p>
              <p className="mt-1.5 text-base font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TrustRow() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full border bg-muted text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Đăng nhập an toàn</p>
              <p className="text-sm text-muted-foreground">
                Điều hướng đúng quyền ngay sau khi xác thực.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full border bg-muted text-primary">
              <Building2 className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Đúng site vận hành</p>
              <p className="text-sm text-muted-foreground">
                Giữ nguyên ngữ cảnh chi nhánh và tuyến nghiệp vụ hiện có.
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
    <main id="main-content" className="min-h-dvh bg-background p-4 sm:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-2 lg:items-stretch">
        <BrandPanel />

        <section className="order-1 flex lg:order-2 lg:items-center">
          <div className="w-full space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <UtensilsCrossed className="size-5" />
                  </div>
                  <Badge variant="secondary">Cổng nhân viên</Badge>
                </div>
                <CardTitle className="text-2xl sm:text-3xl">
                  Sẵn sàng vào ca, đúng vai trò
                </CardTitle>
                <CardDescription>
                  Giao diện mới, hành động rõ hơn, nhưng không thay đổi luồng
                  quyền hay đường dẫn đang vận hành.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
