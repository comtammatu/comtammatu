import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock3, ListChecks, UserRound } from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppHeader } from "@/components/app-header";
import { AppPage } from "@/components/surface";
import { PwaRuntimeProvider } from "@/components/pwa-runtime";
import { loadAuthState } from "@/_lib/auth";

const SELF_NAV = [
  { href: "/me", label: "Công việc", icon: ListChecks },
  { href: "/me/clock", label: "Chấm công", icon: Clock3 },
  { href: "/me/schedule", label: "Lịch", icon: CalendarDays },
  { href: "/me/profile", label: "Hồ sơ", icon: UserRound },
] as const;

export default async function SelfServiceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();
  if (claims.user_role === "owner") redirect("/");
  if (claims.branch_id != null) redirect(`/br/${claims.branch_id}/shift`);

  return (
    <PwaRuntimeProvider>
      <div className="chrome-safe-pt flex h-dvh w-full flex-col overflow-hidden bg-muted/30">
        <AppHeader
          // eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: self-service shell title
          title="Công việc của tôi"
          subtitle={ROLE_LABEL_VI[claims.user_role]}
          homeHref="/me"
          wide
        />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AppPage
            density="compact"
            className="flex min-h-0 flex-1 flex-col"
            contentClassName="min-h-0 flex-1 max-w-lg md:max-w-2xl"
          >
            {children}
          </AppPage>
        </main>
        <nav
          // eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: self-service navigation landmark
          aria-label="Điều hướng cá nhân"
          className="grid grid-cols-4 border-t bg-background px-2 py-2"
        >
          {SELF_NAV.map(({ href, label, icon: Icon }) => (
            <Button
              key={href}
              variant="ghost"
              size="touch"
              className="flex-col gap-1 text-xs"
              render={<Link href={href} />}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </nav>
      </div>
    </PwaRuntimeProvider>
  );
}
