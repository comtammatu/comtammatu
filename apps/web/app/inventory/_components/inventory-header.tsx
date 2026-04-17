"use client";

import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@comtammatu/ui/components/breadcrumb";
import { SidebarTrigger } from "@comtammatu/ui/components/sidebar";

interface InventoryHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: string[];
  actions?: ReactNode;
}

export function InventoryHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: InventoryHeaderProps) {
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;

  return (
    <header className="workspace-header-card mx-4 mt-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SidebarTrigger />
            {hasBreadcrumbs ? (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((segment, idx) => (
                    <Fragment key={`${segment}-${String(idx)}`}>
                      <BreadcrumbItem>
                        <BreadcrumbPage className="font-normal text-muted-foreground">
                          {segment}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                      {idx < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <span className="workspace-context-pill">Kho vận</span>
            )}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
