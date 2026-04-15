import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { type BetaNavItem } from "../_lib/routes";
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

interface SummaryItem {
  label: string;
  value: string;
  detail: string;
}

export function RouteScaffold({
  eyebrow,
  title,
  description,
  legacyHref,
  status,
  summary,
  related,
}: {
  eyebrow: string;
  title: string;
  description: string;
  legacyHref: string;
  status: "live-data" | "transition";
  summary: SummaryItem[];
  related: BetaNavItem[];
}) {
  return (
    <section className="space-y-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{eyebrow}</Badge>
            <Badge variant={status === "live-data" ? "secondary" : "outline"}>
              {status === "live-data" ? "Dữ liệu thật" : "Đang chuyển đổi"}
            </Badge>
          </div>
          <div className="space-y-2">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href={legacyHref}
            className={buttonVariants({ variant: "default", size: "default" })}
          >
            Mở workflow hiện tại
            <ExternalLink className="size-4" />
          </Link>
          <Link
            href="/beta"
            className={buttonVariants({ variant: "outline", size: "default" })}
          >
            Về hub beta
            <ArrowUpRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle>{item.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{item.detail}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Ghi chú beta</CardTitle>
            <CardDescription>
              Beta giữ nguyên quyền truy cập và dữ liệu hiện có. Trang này chỉ đổi lớp trình bày
              và giữ đường quay lại workflow hiện tại.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Route có trạng thái <strong className="text-foreground">Dữ liệu thật</strong> đang dùng
            loader hiện có. Route ở trạng thái <strong className="text-foreground">Đang chuyển đổi</strong>{" "}
            vẫn giữ mirror route để deep-link và điều hướng không bị đứt.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liên quan</CardTitle>
            <CardDescription>Các route cùng section trong beta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {related.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Route này hiện là điểm cuối trong section hoặc đang đi qua pattern động.
              </p>
            ) : (
              related.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "default" }),
                    "w-full justify-between",
                  )}
                >
                  <span>{item.label}</span>
                  <ArrowUpRight className="size-4" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
