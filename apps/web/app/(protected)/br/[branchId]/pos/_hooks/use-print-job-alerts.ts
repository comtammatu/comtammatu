"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { createClient } from "@comtammatu/database/supabase/client";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import {
  playOperationalAlert,
  type OperationalAudioMode,
} from "@lib/operational-audio";
import { retryPrintJob } from "../print-actions";

const PRINT_JOB_TYPE_LABELS: Record<string, string> = {
  kitchen_ticket: "Phiếu bếp",
  receipt: "Hóa đơn",
  reprint: "Phiếu in lại",
  cancel_ticket: "Phiếu hủy món",
  provisional_bill: "Phiếu tạm tính",
  shift_close_report: "Phiếu kết ca",
};

const FAILED_STATUSES = new Set(["failed", "expired"]);
// Catch-up window for fails that landed while the tab was hidden or the
// realtime channel was reconnecting.
const CATCH_UP_WINDOW_MS = 5 * 60 * 1000;

function getJobTypeLabel(jobType: unknown): string {
  if (typeof jobType === "string") {
    const label = PRINT_JOB_TYPE_LABELS[jobType];
    if (label) return label;
  }
  return "Phiếu in";
}

interface UsePrintJobAlertsArgs {
  branchId: number;
  audioMode?: OperationalAudioMode;
}

/**
 * Surfaces the fate of print jobs AFTER enqueue. The enqueue toast only
 * proves the job row exists; paper jams, LAN drops, and dead printers
 * surface as `failed`/`expired` transitions that previously never reached
 * the counter. Each alert carries a one-tap retry.
 */
export function usePrintJobAlerts({
  branchId,
  audioMode = "off",
}: UsePrintJobAlertsArgs): void {
  const alertedJobIdsRef = useRef<Set<number>>(new Set());
  const audioModeRef = useRef(audioMode);
  useEffect(() => {
    audioModeRef.current = audioMode;
  }, [audioMode]);

  const handleRetry = useCallback(async (jobId: number) => {
    const result = await retryPrintJob(jobId);
    if (!result.success) {
      toast.error(result.error ?? "Không thể thử lại. Kiểm tra máy in.");
    }
  }, []);

  const notifyFailedJob = useCallback(
    (job: { id: number; job_type?: unknown }) => {
      if (alertedJobIdsRef.current.has(job.id)) return;
      alertedJobIdsRef.current.add(job.id);
      playOperationalAlert({
        kind: "pos.print_failed",
        mode: audioModeRef.current,
        branchId,
      });
      toast.error(`In thất bại — ${getJobTypeLabel(job.job_type)}`, {
        description: "Kiểm tra giấy/máy in rồi bấm In lại.",
        duration: 10_000,
        action: {
          label: "In lại",
          onClick: () => {
            void handleRetry(job.id);
          },
        },
      });
    },
    [handleRetry],
  );

  const notifyFailedJobRef = useRef(notifyFailedJob);
  useEffect(() => {
    notifyFailedJobRef.current = notifyFailedJob;
  }, [notifyFailedJob]);

  // Catch-up sweep: alert for jobs that failed within the window while no
  // realtime event reached this tab (hidden tab, WS reconnect).
  const sweepRecentFailures = useCallback(async () => {
    const supabase = createClient();
    const sinceIso = new Date(Date.now() - CATCH_UP_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("print_jobs")
      .select("id, job_type, status")
      .eq("branch_id", branchId)
      .in("status", ["failed", "expired"])
      .gte("created_at", sinceIso)
      .order("id", { ascending: false })
      .limit(5);
    for (const job of data ?? []) {
      notifyFailedJobRef.current({ id: job.id, job_type: job.job_type });
    }
  }, [branchId]);

  const sweepRef = useRef(sweepRecentFailures);
  useEffect(() => {
    sweepRef.current = sweepRecentFailures;
  }, [sweepRecentFailures]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sweepRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const initialSubscribeSeenRef = useRef(false);

  useRealtimeChannel(
    (supabase) =>
      supabase
        .channel(`pos-print-jobs-${String(branchId)}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "print_jobs",
            filter: `branch_id=eq.${String(branchId)}`,
          },
          (payload) => {
            const next = payload.new as {
              id?: unknown;
              status?: unknown;
              job_type?: unknown;
            };
            const old = payload.old as { status?: unknown } | null;
            const id = typeof next.id === "number" ? next.id : Number(next.id);
            if (!Number.isFinite(id)) return;
            const nextStatus =
              typeof next.status === "string" ? next.status : null;
            const oldStatus =
              old && typeof old.status === "string" ? old.status : null;
            // React only to the transition INTO a terminal failure —
            // agents may touch failed rows again without re-failing.
            if (nextStatus === null || !FAILED_STATUSES.has(nextStatus)) {
              return;
            }
            if (oldStatus !== null && FAILED_STATUSES.has(oldStatus)) return;
            notifyFailedJobRef.current({ id, job_type: next.job_type });
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          // Reconnect: sweep for failures missed during the disconnect.
          void sweepRef.current();
        }),
    [branchId],
  );
}
