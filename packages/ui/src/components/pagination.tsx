import * as React from "react";
import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { ACTIONS_VI, UI_VI } from "@comtammatu/shared/messages";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { getPaginationItems, PAGINATION_ELLIPSIS } from "../lib/pagination";

type PaginationProps = Omit<React.ComponentProps<"nav">, "onChange"> & {
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  siblings?: number;
  totalLabel?: React.ReactNode;
};

function Pagination({
  page,
  pageCount,
  onPageChange,
  siblings = 1,
  totalLabel,
  className,
  ...props
}: PaginationProps) {
  const safeCount = Math.max(1, Math.floor(pageCount));
  const safePage = Math.min(Math.max(1, Math.floor(page)), safeCount);
  const items = getPaginationItems(safePage, safeCount, siblings);
  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > safeCount || nextPage === safePage) return;
    onPageChange?.(nextPage);
  };

  return (
    <nav
      aria-label={UI_VI.paginationNav}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      {...props}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => goToPage(safePage - 1)}
        disabled={safePage <= 1}
        aria-label={ACTIONS_VI.prevPage}
      >
        <IconChevronLeft className="size-3.5" />
      </Button>
      {items.map((item, index) =>
        item === PAGINATION_ELLIPSIS ? (
          <span
            key={`${item}-${index}`}
            className="flex size-7 items-center justify-center text-xs text-muted-foreground"
            aria-hidden="true"
          >
            ...
          </span>
        ) : (
          <Button
            key={item}
            type="button"
            variant={item === safePage ? "default" : "outline"}
            size="icon-sm"
            className="font-mono tabular-nums"
            aria-current={item === safePage ? "page" : undefined}
            onClick={() => goToPage(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => goToPage(safePage + 1)}
        disabled={safePage >= safeCount}
        aria-label={ACTIONS_VI.nextPage}
      >
        <IconChevronRight className="size-3.5" />
      </Button>
      {totalLabel ? (
        <span className="ml-1 text-xs text-muted-foreground">{totalLabel}</span>
      ) : null}
    </nav>
  );
}

export { Pagination };
