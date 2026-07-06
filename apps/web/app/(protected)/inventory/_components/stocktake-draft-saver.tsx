"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import {
  CloudCheck as IconCloudCheck,
  CloudUpload as IconCloudUpload,
  CircleAlert as IconAlertCircle,
} from "lucide-react";
import { formatVNTime } from "@comtammatu/shared/time";
import { saveStocktakeDraft } from "../stocktake-actions";

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
 * 30s-debounced auto-save hook for stocktake counter drafts (S13a).
 *
 * Triggers a save when `counts` changes AND `debounceMs` passes without
 * a new change. Persists via `saveStocktakeDraft` server action.
 *
 * Exposes status + lastSavedAt for the badge. Never throws — errors set
 * status to "error" and caller shows the badge. Draft is discarded when
 * session finalizes (migration CASCADE).
 */
export function useStocktakeDraftSaver({
  sessionId,
  counts,
  debounceMs = 30_000,
  enabled = true,
}: UseStocktakeDraftSaverOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerialized = useRef<string>("");
  const inflight = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(counts);
    if (serialized === lastSerialized.current) return;
    // No entries → skip first dummy save.
    if (serialized === "{}") return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (inflight.current) return;
      inflight.current = true;
      setStatus("saving");
      try {
        const res = await saveStocktakeDraft({
          sessionId,
          draftCounts: counts,
        });
        if (res.success && res.data) {
          lastSerialized.current = serialized;
          setLastSavedAt(res.data.lastSavedAt);
          setStatus("saved");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      } finally {
        inflight.current = false;
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [counts, debounceMs, enabled, sessionId]);

  /** Force-flush (e.g. before manual submit). */
  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inflight.current) return;
    inflight.current = true;
    setStatus("saving");
    try {
      const res = await saveStocktakeDraft({ sessionId, draftCounts: counts });
      if (res.success && res.data) {
        lastSerialized.current = JSON.stringify(counts);
        setLastSavedAt(res.data.lastSavedAt);
        setStatus("saved");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      inflight.current = false;
    }
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
          ? `Đã lưu ${formatVNTime(lastSavedAt)}`
          : "Đã lưu draft";
      case "error":
        return "Lỗi lưu draft — sẽ thử lại";
      default:
        return lastSavedAt
          ? `Đã lưu ${formatVNTime(lastSavedAt)}`
          : "Chưa có draft";
    }
  })();

  const tone =
    status === "error"
      ? "border-destructive/20 bg-destructive/10 text-destructive"
      : status === "saving"
        ? "border-info/20 bg-info/10 text-info"
        : status === "saved"
          ? "border-success/20 bg-success/10 text-success"
          : "border-muted bg-muted/30 text-muted-foreground";

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
