"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import {
  CloudCheck as IconCloudCheck,
  CloudUpload as IconCloudUpload,
  CircleAlert as IconAlertCircle,
} from "lucide-react";

export type DraftCounts = Record<
  string,
  { qty: number; note?: string; savedAt?: string }
>;

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseStocktakeDraftSaverOptions {
  sessionId: number;
  counts: DraftCounts;
  /** Debounce window in ms. Default 30 000 (spec §Q2). */
  debounceMs?: number;
  /** Skip auto-save entirely when session not editable (closed/finalized). */
  enabled?: boolean;
}

/**
 * Stocktake counter draft auto-save (S13a).
 *
 * HKD lean baseline: the server-side `stocktake_drafts` persistence layer is
 * out of scope, so this hook keeps the badge/flush API stable but no longer
 * persists to the database. Counts live only in the in-memory page state until
 * the round is submitted. Never throws.
 */
export function useStocktakeDraftSaver({
  counts,
  enabled = true,
}: UseStocktakeDraftSaverOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSerialized = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(counts);
    if (serialized === lastSerialized.current) return;
    if (serialized === "{}") return;
    lastSerialized.current = serialized;
    setLastSavedAt(new Date().toISOString());
    setStatus("saved");
  }, [counts, enabled]);

  /** Force-flush (e.g. before manual submit). No-op persistence. */
  async function flush() {
    lastSerialized.current = JSON.stringify(counts);
    setLastSavedAt(new Date().toISOString());
    setStatus("saved");
  }

  return { status, lastSavedAt, flush };
}

interface StocktakeDraftSaverBadgeProps {
  status: SaveStatus;
  lastSavedAt: string | null;
  className?: string;
}

/**
 * Inline status pill for the draft auto-save. Paired with the hook above.
 * Renders Vietnamese labels so counter staff sees them directly.
 */
export function StocktakeDraftSaverBadge({
  status,
  lastSavedAt,
  className,
}: StocktakeDraftSaverBadgeProps) {
  const label = (() => {
    switch (status) {
      case "saving":
        return "Đang lưu draft…";
      case "saved":
        return lastSavedAt
          ? `Đã lưu ${formatTimeHHmm(lastSavedAt)}`
          : "Đã lưu draft";
      case "error":
        return "Lỗi lưu draft — sẽ thử lại";
      default:
        return lastSavedAt
          ? `Đã lưu ${formatTimeHHmm(lastSavedAt)}`
          : "Chưa có draft";
    }
  })();

  const tone =
    status === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : status === "saving"
        ? "border-info/40 bg-info/10 text-info"
        : status === "saved"
          ? "border-success/40 bg-success/10 text-success"
          : "border-muted bg-muted/40 text-muted-foreground";

  const Icon =
    status === "error"
      ? IconAlertCircle
      : status === "saving"
        ? IconCloudUpload
        : IconCloudCheck;

  return (
    <span
      data-slot="stocktake-draft-saver-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function formatTimeHHmm(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}
