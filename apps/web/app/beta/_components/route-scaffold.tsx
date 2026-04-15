import Link from "next/link";
import { ArrowUpRight, Clock3, ExternalLink, Sparkles } from "lucide-react";
import { type BetaNavItem } from "../_lib/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_20rem]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 uppercase tracking-widest">
              {eyebrow}
            </Badge>
            <Badge
              variant={status === "live-data" ? "secondary" : "outline"}
              className="rounded-full px-3 py-1"
            >
              {status === "live-data" ? "Dữ liệu thật" : "Đang chuyển đổi"}
            </Badge>
          </div>

          <div className="space-y-3">
            <h1 className="font-heading text-5xl leading-none tracking-tight text-foreground">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="h-11 rounded-2xl px-5">
              <Link href={legacyHref}>
                Mở workflow hiện tại
                <ExternalLink className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-2xl px-5">
              <Link href="/beta">
                Về hub beta
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <Card className="border-border/60 bg-sidebar text-sidebar-foreground">
          <CardHeader>
            <Badge
              variant="outline"
              className="w-fit rounded-full border-white/10 bg-white/10 px-3 py-1 text-sidebar-foreground"
            >
              Beta status
            </Badge>
            <CardTitle className="font-heading text-3xl text-sidebar-foreground">
              {status === "live-data" ? "Sẵn sàng trải nghiệm" : "Đang mở rộng chiều sâu"}
            </CardTitle>
            <CardDescription className="text-sidebar-foreground/72">
              {status === "live-data"
                ? "Màn này đã nối vào dữ liệu thật và phản ánh trực tiếp nhịp vận hành hiện có."
                : "UI beta đã có ngữ cảnh, nav và trạng thái rõ ràng; workflow chuyên sâu tiếp tục mở dần ở các đợt sau."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-sidebar-foreground/76">
            <div className="flex items-start gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
              <Clock3 className="mt-0.5 size-4 text-sidebar-primary" />
              <p>
                Beta đang chạy song song với hệ thống hiện tại. Khi cần thao tác đầy đủ, bạn luôn có lối quay về route legacy tương ứng ngay trong trang này.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} className="border-border/60 bg-card/90">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {item.label}
              </p>
              <CardTitle className="font-heading text-4xl leading-none text-foreground">
                {item.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">
              {item.detail}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_20rem]">
        <Card className="border-border/60 bg-card/88">
          <CardHeader>
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              Ops note
            </Badge>
            <CardTitle className="font-heading text-3xl">Cách đọc bề mặt beta</CardTitle>
            <CardDescription className="text-base leading-7">
              Beta không thay đổi quyền hay dữ liệu nền. Nó thay đổi cách nhóm thông tin, ưu tiên tín hiệu vận hành và tạo lối đi rõ hơn giữa các route đang sống.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              Các route đã có trạng thái <strong className="text-foreground">Dữ liệu thật</strong> đang dùng truy vấn hoặc loader hiện hữu để phản ánh tình hình hiện tại. Các route còn ở trạng thái <strong className="text-foreground">Đang chuyển đổi</strong> vẫn có shell beta, điều hướng, và ngữ cảnh để người dùng không bị rơi khỏi flow.
            </p>
            <Separator />
            <div className="flex items-start gap-3 rounded-3xl border border-border/60 bg-muted/35 p-4">
              <Sparkles className="mt-0.5 size-4 text-primary" />
              <p>
                Thiết kế beta đi theo hướng editorial-industrial: ít nhiễu hơn, thứ bậc mạnh hơn, và luôn chừa một nhịp quay về route hiện tại khi workflow chưa được chuyển trọn vẹn.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/88">
          <CardHeader>
            <CardTitle className="font-heading text-3xl">Liên quan</CardTitle>
            <CardDescription>
              Các route cùng section để tiếp tục khám phá mà không rời khỏi beta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {related.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Route này hiện là điểm cuối trong section hoặc đang đi qua pattern động.
              </p>
            ) : (
              related.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between rounded-3xl border border-border/60 bg-background/75 px-4 py-3 text-sm transition-colors hover:bg-muted"
                >
                  <span className="font-medium text-foreground">{item.label}</span>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
