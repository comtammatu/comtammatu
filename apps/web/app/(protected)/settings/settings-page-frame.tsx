import Link from "next/link";
import type { ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@comtammatu/ui/components/breadcrumb";
import {
  AppPage,
  AppPageHeader,
  type AppPageProps,
} from "@/components/surface";
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
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href="/settings" />}>
                    {messages.settings.pages.settingsHomeLink}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : undefined
        }
      />
      {children}
    </AppPage>
  );
}
