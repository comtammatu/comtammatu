"use client";

import {
  AppLinkCard as SharedAppLinkCard,
  LinkCardGrid,
  type AppLinkCardProps as SharedAppLinkCardProps,
  type LinkCardGridProps,
} from "@comtammatu/ui/surface/link-card";
import { ProtectedLink } from "@/_components/protected-link";

export type AppLinkCardProps = SharedAppLinkCardProps;

export function AppLinkCard({
  renderLink = (href, linkProps) => (
    <ProtectedLink href={href} {...linkProps} />
  ),
  ...props
}: AppLinkCardProps) {
  return <SharedAppLinkCard renderLink={renderLink} {...props} />;
}

export { LinkCardGrid, type LinkCardGridProps };
