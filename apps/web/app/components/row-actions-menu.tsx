"use client";

import Link from "next/link";
import {
  RowActionsMenu as CanonicalRowActionsMenu,
  RowActionsContextMenuItems as CanonicalRowActionsContextMenuItems,
  type RowActionItem,
  type RowActionsMenuProps as CanonicalRowActionsMenuProps,
  type RowActionsContextMenuItemsProps as CanonicalRowActionsContextMenuItemsProps,
  type RowActionsMenuLinkRender,
} from "@comtammatu/ui/components/row-actions-menu";

export type {
  RowActionItem,
  RowActionsMenuLinkRender,
};

export type RowActionsMenuProps = Omit<CanonicalRowActionsMenuProps, "renderLink"> & {
  renderLink?: RowActionsMenuLinkRender;
};

const defaultRenderLink: RowActionsMenuLinkRender = ({ href, children }) => (
  <Link href={href}>{children}</Link>
);

export function RowActionsMenu({
  renderLink = defaultRenderLink,
  ...props
}: RowActionsMenuProps) {
  return <CanonicalRowActionsMenu renderLink={renderLink} {...props} />;
}

export type RowActionsContextMenuItemsProps = Omit<
  CanonicalRowActionsContextMenuItemsProps,
  "renderLink"
> & {
  renderLink?: RowActionsMenuLinkRender;
};

export function RowActionsContextMenuItems({
  renderLink = defaultRenderLink,
  ...props
}: RowActionsContextMenuItemsProps) {
  return (
    <CanonicalRowActionsContextMenuItems renderLink={renderLink} {...props} />
  );
}
