import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { type BadgeProps, Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";

type BranchActionIconTone = "primary" | "info" | "muted";

const ICON_TONE_CLASSNAME: Record<BranchActionIconTone, string> = {
  primary: "bg-muted text-primary",
  info: "bg-info/10 text-info",
  muted: "bg-muted text-muted-foreground",
};

export type BranchActionItemProps = {
  title: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  href?: string;
  ctaLabel?: string;
  ariaLabel?: string;
  iconTone?: BranchActionIconTone;
  badge?: {
    children: ReactNode;
    variant: BadgeProps["variant"];
  };
};

export function BranchActionItem({
  title,
  description,
  icon,
  href,
  ctaLabel,
  ariaLabel,
  iconTone = "primary",
  badge,
}: BranchActionItemProps) {
  return (
    <Item
      variant="outline"
      className="items-start gap-3 bg-card p-3 sm:flex-nowrap sm:items-center"
    >
      <ItemMedia
        variant="icon"
        className={`size-10 rounded-md ${ICON_TONE_CLASSNAME[iconTone]} [&_svg]:size-5`}
      >
        {icon}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle size="heading" className="line-clamp-none flex w-full flex-wrap items-center gap-2 sm:text-base">
          {title}
          {badge ? (
            <Badge variant={badge.variant} className="shrink-0">
              {badge.children}
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription className="line-clamp-none text-sm leading-6">
          {description}
        </ItemDescription>
      </ItemContent>
      {href && ctaLabel ? (
        <ItemActions className="basis-full justify-start pt-1 sm:ml-auto sm:basis-auto sm:justify-end sm:pt-0">
          <Button
            asChild
            variant="outline"
            size="touch"
            className="w-full sm:w-auto"
          >
            <Link href={href} aria-label={ariaLabel}>
              {ctaLabel}
              <IconArrowRight className="size-4" data-icon="inline-end" />
            </Link>
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}
