"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { AppPage, type AppPageProps } from "./app-page";
import type { SurfaceWidth } from "./types";

export type DocumentFormFrameProps = {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  bodyClassName?: string;
  scroll?: boolean;
  width?: SurfaceWidth;
  padded?: boolean;
  density?: AppPageProps["density"];
  mobile?: boolean;
};

export function DocumentFormFrame({
  header,
  children,
  footer,
  className,
  contentClassName,
  bodyClassName,
  scroll = false,
  width = "wide",
  padded = true,
  density = "comfortable",
  mobile = false,
}: DocumentFormFrameProps) {
  return (
    <AppPage
      scroll={scroll}
      width={width}
      padded={padded}
      density={density}
      mobile={mobile}
      className={className}
      contentClassName={contentClassName}
      footer={footer}
    >
      {header}
      <div className={cn("flex min-w-0 flex-col gap-4", bodyClassName)}>
        {children}
      </div>
    </AppPage>
  );
}
