import Link from "next/link";
import type { ReactNode } from "react";
import { AppPage, AppPageHeader, type AppPageProps } from "@/components/surface";
import { messages } from "@lib/messages";

interface SettingsPageFrameProps {
  /** Optional non-module context only; do not pass sidebar/"Cài đặt" synonyms. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  showSettingsHomeLink?: boolean;
  // Settings forms default to a focused column; jobs/data views pass "wide".
  width?: AppPageProps["width"];
}

export function SettingsPageFrame({
  eyebrow,
  title,
  description,
  actions,
  children,
  showSettingsHomeLink = true,
  width = "default",
}: SettingsPageFrameProps) {
  return (
    <AppPage width={width} density="compact">
      <AppPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        breadcrumb={
          showSettingsHomeLink ? (
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              {messages.settings.pages.settingsHomeLink}
            </Link>
          ) : undefined
        }
      />
      {children}
    </AppPage>
  );
}
