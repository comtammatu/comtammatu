"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

type ButtonSize = NonNullable<ComponentProps<typeof Button>["size"]>;

/**
 * Control_surface action button: touch below Owner shell cutover, dense above.
 * Use `density="header"` for AppPageHeader primary/outline actions (dense = lg).
 */
export function ResponsiveActionButton({
  density = "body",
  size: sizeOverride,
  ...props
}: Omit<ComponentProps<typeof Button>, "size"> & {
  density?: "header" | "body" | "hero";
  size?: ButtonSize;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const denseSize: ButtonSize =
    density === "header" ? "lg" : density === "hero" ? "lg" : "default";
  const touchSize: ButtonSize = density === "hero" ? "touch-lg" : "touch";
  const size = sizeOverride ?? (isTouchLayout ? touchSize : denseSize);
  return <Button size={size} {...props} />;
}

export function ResponsiveBackButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <ResponsiveActionButton
      variant="outline"
      density="header"
      render={<Link href={href} />}
    >
      {children}
    </ResponsiveActionButton>
  );
}
