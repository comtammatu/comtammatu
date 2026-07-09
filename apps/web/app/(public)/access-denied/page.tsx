/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: access-denied page keeps short auth recovery copy inline */

import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ShieldAlert as IconShieldExclamation,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppSection } from "@/components/surface";
import { AppHeader } from "@/components/app-header";
import { BRAND_NAME } from "@/components/brand";
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
    <div className="flex w-full max-w-xl flex-col gap-4">
      <AppHeader title={BRAND_NAME} className="static" />

      <AppSection
        title={copy.title}
        description={copy.description}
        icon={<IconShieldExclamation />}
        action={
          <Badge variant="outline" className={TONE_BADGE_CLASS[copy.tone]}>
            Quyền truy cập
          </Badge>
        }
      >
        <div className="rounded-md border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
          {copy.nextStep}
          {from ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground/80">
              Đường dẫn bị chặn: <span className="font-mono">{from}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="touch" className="flex-1">
            <Link href="/" replace>
              <IconArrowLeft className="size-4" />
              Về trang mặc định
            </Link>
          </Button>
          <form action="/api/auth/signout" method="post" className="flex-1">
            <Button type="submit" variant="outline" size="touch" className="w-full">
              Đăng xuất
            </Button>
          </form>
        </div>
      </AppSection>
    </div>
  );
}
