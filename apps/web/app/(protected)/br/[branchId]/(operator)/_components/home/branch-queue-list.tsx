"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";
import { QUEUE_ROW_ICONS, type QueueRow } from "./branch-queue-rows";

const homeCopy = messages.operator.home;
const PREVIEW_COUNT = 3;

function QueueRowItem({ row }: { row: QueueRow }) {
  const Icon = QUEUE_ROW_ICONS[row.key];
  return (
    <Item
      variant="outline"
      size="sm"
      className="chrome-tap min-h-12 select-none bg-card transition-transform motion-safe:active:scale-[0.97]"
      render={<Link href={row.href} />}
    >
      <ItemMedia
        variant="icon"
        className={
          row.priority === "high"
            ? "rounded-md bg-warning/10 p-2 text-warning"
            : "rounded-md bg-muted p-2 text-muted-foreground"
        }
      >
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle size="heading" className="line-clamp-2 w-full text-sm">
          {row.title}
        </ItemTitle>
      </ItemContent>
      <ItemActions className="shrink-0 text-muted-foreground">
        <Badge variant="warning">{formatCount(row.count)}</Badge>
        <ChevronRight aria-hidden />
      </ItemActions>
    </Item>
  );
}

export function BranchQueueList({ rows }: { rows: QueueRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = rows.length > PREVIEW_COUNT;
  const visible =
    expanded || !needsCollapse ? rows : rows.slice(0, PREVIEW_COUNT);
  const hiddenCount = rows.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <ItemGroup className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((row) => (
          <QueueRowItem key={row.key} row={row} />
        ))}
      </ItemGroup>
      {needsCollapse ? (
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="self-start text-sm"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? homeCopy.queueShowLess
            : homeCopy.queueShowMore(hiddenCount)}
        </Button>
      ) : null}
    </div>
  );
}
