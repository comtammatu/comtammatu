"use client";

import { useEffect, useState } from "react";
import { messages } from "@lib/messages";

export function StationLandscapeHint() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const portraitQuery = window.matchMedia("(orientation: portrait)");
    const sync = () => {
      setShowHint(portraitQuery.matches);
    };
    sync();

    const orientation = window.screen?.orientation;
    if (orientation != null && typeof orientation.lock === "function") {
      void orientation.lock("landscape").then(sync, sync);
    }

    portraitQuery.addEventListener("change", sync);
    return () => {
      portraitQuery.removeEventListener("change", sync);
    };
  }, []);

  if (!showHint) return null;

  return (
    <div
      role="status"
      className="shrink-0 border-b border-border/60 bg-background/90 px-3 py-2 text-center text-sm font-semibold text-foreground"
    >
      {messages.common.stationRotateLandscape}
    </div>
  );
}
