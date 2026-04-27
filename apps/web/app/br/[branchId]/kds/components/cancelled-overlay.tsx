"use client";

import { useEffect, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";

import { STATES_VI } from "@comtammatu/shared/messages";
const FADE_AFTER_MS = 30_000;

export function CancelledOverlay() {
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setFaded(true), FADE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-destructive/20 motion-safe:transition-opacity motion-safe:duration-500",
        faded && "opacity-40",
      )}
      aria-hidden
    >
      <Badge variant="destructive" className="text-xs font-bold uppercase">
        {STATES_VI.cancelled}
      </Badge>
    </div>
  );
}
