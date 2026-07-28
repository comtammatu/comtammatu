/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: access-denied page keeps short auth recovery copy inline */

import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ShieldAlert as IconShieldExclamation,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  getDefaultRedirect,
  resolveBlockedState,
} from "@comtammatu/shared/auth";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  Badge,
  type BadgeProps,
} from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { AppSection } from "@/components/surface";
import { AppHeader } from "@/components/app-header";
import { BRAND_NAME } from "@/components/brand";

type ToneClass = "danger" | "warning" | "neutral";

const TONE_BADGE_VARIANT: Record<
  ToneClass,
  NonNullable<BadgeProps["variant"]>
> = {
  danger: "destructive",
  warning: "warning",
  neutral: "outline",
};

interface AccessDeniedPageProps {
  searchParams: Promise<{
    reason?: string;
    from?: string;
  }>;
}

async function resolveDefaultHomeHref(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return "/login";
    const claims = extractClaimsFromAccessToken(session.access_token);
    if (!claims) return "/login";
    return getDefaultRedirect(claims);
  } catch {
    return "/login";
  }
}

export default async function AccessDeniedPage({
  searchParams,
}: AccessDeniedPageProps) {
  const { reason, from } = await searchParams;
  const { copy } = resolveBlockedState(reason);
  const homeHref = await resolveDefaultHomeHref();

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <AppHeader title={BRAND_NAME} className="static" />

      <AppSection
        title={copy.title}
        headingLevel="h1"
        description={copy.description}
        icon={<IconShieldExclamation />}
        action={
          <Badge variant={TONE_BADGE_VARIANT[copy.tone]}>
            Quyền truy cập
          </Badge>
        }
      >
        <NoteCallout
          tone="muted"
          className="text-sm leading-6 text-muted-foreground"
        >
          {copy.nextStep}
          {from ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground/80">
              Đường dẫn bị chặn: <span className="font-mono">{from}</span>
            </p>
          ) : null}
        </NoteCallout>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="touch"
            className="flex-1"
            render={<Link href={homeHref} replace />}
          >
            <IconArrowLeft className="size-4" />
            {ACTIONS_VI.goDefaultHome}
          </Button>
          <form action="/api/auth/signout" method="post" className="flex-1">
            <Button
              type="submit"
              variant="outline"
              size="touch"
              className="w-full"
            >
              {ACTIONS_VI.signInAgain}
            </Button>
          </form>
        </div>
      </AppSection>
    </div>
  );
}
