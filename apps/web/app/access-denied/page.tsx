import Link from "next/link";
import { ArrowLeft as IconArrowLeft, ShieldAlert as IconShieldExclamation } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { resolveBlockedState } from "@comtammatu/shared/auth";

type ToneClass = "danger" | "warning" | "neutral";

const TONE_BADGE_CLASS: Record<ToneClass, string> = {
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  neutral: "border-border bg-secondary text-secondary-foreground",
};

interface AccessDeniedPageProps {
  searchParams: Promise<{
    reason?: string;
    from?: string;
  }>;
}

export default async function AccessDeniedPage({
  searchParams,
}: AccessDeniedPageProps) {
  const { reason, from } = await searchParams;
  const { copy } = resolveBlockedState(reason);

  return (
    <Card className="w-full max-w-xl shadow-sm">
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
            <IconShieldExclamation className="size-5" />
          </div>
          <Badge variant="outline" className={TONE_BADGE_CLASS[copy.tone]}>
            Quyền truy cập
          </Badge>
        </div>
        <div className="space-y-2">
          <CardTitle className="font-heading text-2xl sm:text-3xl">
            {copy.title}
          </CardTitle>
          <CardDescription className="text-sm leading-6 sm:text-base">
            {copy.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          {copy.nextStep}
          {from ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground/80">
              Đường dẫn bị chặn: <span className="font-mono">{from}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link href="/" replace>
              <IconArrowLeft className="size-4" />
              Về trang mặc định
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/login" replace>
              Đăng nhập lại
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
