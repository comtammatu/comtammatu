"use client";

import type { ComponentProps } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Card } from "@comtammatu/ui/components/card";
import type { SurfaceTone } from "./types";

type OperationalTileTone = "default" | "success" | "warning" | "muted";

const OPERATIONAL_TILE_TONE_CLASSNAME: Record<OperationalTileTone, string> = {
  default: "bg-card hover:border-primary/20",
  success:
    "border-success/20 bg-success/10 text-foreground hover:border-success/20 hover:bg-success/20",
  warning:
    "border-warning/20 bg-warning/10 text-foreground hover:border-warning/20 hover:bg-warning/20",
  muted: "bg-muted/50 text-muted-foreground hover:border-border",
};

export type OperationalTileProps = ComponentProps<typeof Button> & {
  selected?: boolean;
  tone?: OperationalTileTone;
};

export function OperationalTile({
  selected = false,
  tone = "default",
  variant,
  className,
  ...props
}: OperationalTileProps) {
  return (
    <Button
      variant={variant ?? (selected ? "default" : "outline")}
      className={cn(
        selected
          ? "border-primary/20 ring-2 ring-primary/20"
          : OPERATIONAL_TILE_TONE_CLASSNAME[tone],
        className,
      )}
      {...props}
    />
  );
}

const OPERATIONAL_BOARD_CURRENT_CLASSNAME: Record<SurfaceTone, string> = {
  primary: "relative z-10 bg-primary/10 ring-2 ring-primary/20",
  success: "relative z-10 bg-success/10 ring-2 ring-success/20",
  warning: "relative z-10 bg-warning/15 ring-2 ring-warning/20",
  info: "relative z-10 bg-info/10 ring-2 ring-info/20",
  secondary: "relative z-10 bg-secondary/10 ring-2 ring-secondary/20",
};

export type OperationalBoardCardProps = ComponentProps<typeof Card> & {
  current?: boolean;
  currentTone?: SurfaceTone;
  interactive?: boolean;
};

export function OperationalBoardCard({
  current = false,
  currentTone = "primary",
  interactive = false,
  className,
  ...props
}: OperationalBoardCardProps) {
  return (
    <Card
      className={cn(
        "transition",
        interactive && "hover:shadow-effect-card-hover",
        current && OPERATIONAL_BOARD_CURRENT_CLASSNAME[currentTone],
        className,
      )}
      {...props}
    />
  );
}
