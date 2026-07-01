import * as React from "react";
import {
  ArrowDown as IconArrowDown,
  ArrowRight as IconArrowRight,
  ArrowUp as IconArrowUp,
} from "lucide-react";

import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Card, CardContent } from "./card";

type StatDeltaDirection = "up" | "down" | "flat";

type StatProps = Omit<React.ComponentProps<typeof Card>, "size"> & {
  label?: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  deltaDirection?: StatDeltaDirection;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  size?: "default" | "lg";
  plain?: boolean;
};

const deltaIcon = {
  up: IconArrowUp,
  down: IconArrowDown,
  flat: IconArrowRight,
} as const;

const deltaVariant = {
  up: "success",
  down: "destructive",
  flat: "secondary",
} as const;

function Stat({
  label,
  value,
  unit,
  delta,
  deltaDirection,
  hint,
  icon,
  size = "default",
  plain = false,
  className,
  ...props
}: StatProps) {
  const direction =
    deltaDirection ??
    (typeof delta === "string" && delta.trim().startsWith("-") ? "down" : "up");
  const DeltaIcon = deltaIcon[direction];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {label ? (
          <span className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
        ) : (
          <span />
        )}
        {icon ? (
          <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "font-mono font-semibold tabular-nums",
          size === "lg" ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 font-sans text-xs font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {delta != null || hint ? (
        <div className="flex flex-wrap items-center gap-2">
          {delta != null ? (
            <Badge variant={deltaVariant[direction]}>
              <DeltaIcon className="size-3" />
              {delta}
            </Badge>
          ) : null}
          {hint ? (
            <span className="text-xs text-muted-foreground">{hint}</span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (plain) {
    return (
      <div
        data-slot="stat"
        className={cn("flex flex-col gap-2", className)}
        {...props}
      >
        {body}
      </div>
    );
  }

  return (
    <Card data-slot="stat" className={className} {...props}>
      <CardContent className="flex flex-col gap-2">{body}</CardContent>
    </Card>
  );
}

export { Stat };
