"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import { StationSheet } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Item, ItemFooter, ItemGroup } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatVNDateTime, formatVNTime } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  AlertTriangle as IconAlert,
  CheckCircle2 as IconCheck,
  ExternalLink as IconExternalLink,
  Printer as IconPrinter,
  PrinterX as IconPrinterOff,
  RefreshCw as IconRefresh,
  RotateCw as IconRetry,
  X as IconDismiss,
} from "lucide-react";
import { retryPrintJob } from "../print-actions";

export interface AgentStatus {
  agentId: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  hasAgent: boolean;
}

interface PrintJobRecord {
  id: number;
  job_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
}

interface ConfiguredPrinter {
  id: number;
  name: string;
  role: string;
  lan_host: string | null;
  lan_port: number | null;
  paper_width_mm: number;
  is_active: boolean;
  connection_type: string;
}

const PRINT_JOB_TYPE_LABELS: Record<string, string> = {
  kitchen_ticket: "Phiếu bếp",
  receipt: "Hóa đơn thanh toán",
  reprint: "Hóa đơn in lại",
  cancel_ticket: "Phiếu hủy món",
  provisional_bill: "Phiếu tạm tính",
  shift_close_report: "Báo cáo kết ca",
};

function getJobTypeLabel(jobType: string): string {
  return PRINT_JOB_TYPE_LABELS[jobType] ?? "Phiếu in";
}

interface PrinterStatusSheetProps {
  branchId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: AgentStatus;
  onRefresh: () => void;
  settingsHref?: string;
}

export function PrinterStatusSheet({
  branchId,
  open,
  onOpenChange,
  status,
  onRefresh,
  settingsHref,
}: PrinterStatusSheetProps) {
  const t = messages.pos.printerStatus;
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([]);
  const [failedJobs, setFailedJobs] = useState<PrintJobRecord[]>([]);
  const [recentJobs, setRecentJobs] = useState<PrintJobRecord[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const loadDetails = useCallback(async () => {
    if (!open) return;
    setIsLoadingDetails(true);
    try {
      const supabase = createClient();
      const since24hIso = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();

      const [printersRes, failedRes, recentRes] = await Promise.all([
        supabase
          .from("printers")
          .select(
            "id, name, role, lan_host, lan_port, paper_width_mm, is_active, connection_type",
          )
          .eq("branch_id", branchId)
          .order("id"),
        supabase
          .from("print_jobs")
          .select(
            "id, job_type, status, attempts, last_error, created_at, printed_at",
          )
          .eq("branch_id", branchId)
          .in("status", ["failed", "expired"])
          .gte("created_at", since24hIso)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("print_jobs")
          .select(
            "id, job_type, status, attempts, last_error, created_at, printed_at",
          )
          .eq("branch_id", branchId)
          .eq("status", "printed")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (printersRes.data) {
        setPrinters(printersRes.data as ConfiguredPrinter[]);
      }
      if (failedRes.data) {
        setFailedJobs(failedRes.data as PrintJobRecord[]);
      }
      if (recentRes.data) {
        setRecentJobs(recentRes.data as PrintJobRecord[]);
      }
    } finally {
      setIsLoadingDetails(false);
    }
  }, [branchId, open]);

  useEffect(() => {
    if (open) {
      void loadDetails();
    }
  }, [open, loadDetails]);

  const handleRetryJob = (jobId: number) => {
    startTransition(async () => {
      setRetryingJobId(jobId);
      try {
        const result = await retryPrintJob(jobId);
        if (result.success) {
          toast.success(t.retrySuccessToast);
          setFailedJobs((prev) => prev.filter((j) => j.id !== jobId));
          onRefresh();
        } else {
          toast.error(result.error ?? t.retryFailedToast);
        }
      } finally {
        setRetryingJobId(null);
      }
    });
  };

  const handleDismissJob = (jobId: number) => {
    setDismissedIds((prev) => new Set(prev).add(jobId));
    toast.info(t.dismissToast);
  };

  const visibleFailedJobs = failedJobs.filter((j) => !dismissedIds.has(j.id));
  const activeFailedCount = visibleFailedJobs.length;

  return (
    <StationSheet
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      side="right"
      title={
        <span className="flex items-center gap-2 text-base font-semibold">
          <IconPrinter className="size-5 shrink-0" />
          <span>{t.sheetTitle}</span>
          {activeFailedCount > 0 ? (
            <Badge variant="destructive" className="font-mono tabular-nums">
              {t.errorBadge(activeFailedCount)}
            </Badge>
          ) : status.isOnline ? (
            <Badge variant="success">{t.onlineBadge}</Badge>
          ) : (
            <Badge variant="destructive">{t.offlineBadge}</Badge>
          )}
        </span>
      }
      description={t.sheetDescription}
      bodyClassName="p-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {/* Print Agent Heartbeat & Connectivity */}
            <Frame className="flex flex-col gap-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {status.isOnline ? (
                    <IconCheck className="size-4 shrink-0 text-success" />
                  ) : (
                    <IconPrinterOff className="size-4 shrink-0 text-destructive" />
                  )}
                  <span className="text-sm font-semibold">
                    {t.printServiceTitle}
                  </span>
                </div>
                {status.isOnline ? (
                  <Badge variant="outline" className="border-success text-success text-xs font-semibold">
                    {t.connectedBadge}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-destructive text-destructive text-xs font-semibold">
                    {t.disconnectedBadge}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="block font-medium text-foreground">{t.serviceCodeLabel}</span>
                  <span className="font-mono">{status.agentId ?? t.unregisteredCode}</span>
                </div>
                <div>
                  <span className="block font-medium text-foreground">{t.lastResponseLabel}</span>
                  <span>{status.lastSeenAt ? formatVNDateTime(status.lastSeenAt) : t.noResponseYet}</span>
                </div>
              </div>

              {!status.isOnline ? (
                <p className="border-l-2 border-destructive pl-2 text-xs text-destructive">
                  {t.serviceOfflineWarning}
                </p>
              ) : null}
            </Frame>

            {/* Configured LAN Printers */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.lanPrintersTitle(printers.length)}
                </span>
                {settingsHref ? (
                  <Link
                    href={settingsHref}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <span>{t.printerSettingsLink}</span>
                    <IconExternalLink className="size-3" />
                  </Link>
                ) : null}
              </div>

              {printers.length === 0 ? (
                <Frame className="p-3 text-center text-xs text-muted-foreground">
                  {t.noLanPrinters}
                </Frame>
              ) : (
                <ItemGroup className="gap-2">
                  {printers.map((p) => (
                    <Item key={p.id} variant="outline" size="sm" className="bg-card">
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {p.name}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.lan_host}:{p.lan_port ?? 9100} · {t.paperWidth(p.paper_width_mm)}
                          </span>
                        </div>
                        {p.is_active ? (
                          <Badge variant="outline" className="border-success text-success text-xs shrink-0">
                            {t.activeBadge}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs shrink-0">
                            {t.inactiveBadge}
                          </Badge>
                        )}
                      </div>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </div>

            {/* Failed Print Jobs Queue */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-destructive">
                  <IconAlert className="size-3" />
                  <span>{t.failedJobsTitle(visibleFailedJobs.length)}</span>
                </span>
              </div>

              {visibleFailedJobs.length === 0 ? (
                <Frame className="flex flex-row items-center gap-2 p-3 text-xs text-muted-foreground">
                  <IconCheck className="size-4 shrink-0 text-success" />
                  <span>{t.noFailedJobs}</span>
                </Frame>
              ) : (
                <ItemGroup className="gap-2">
                  {visibleFailedJobs.map((job) => (
                    <Item
                      key={job.id}
                      variant="outline"
                      size="sm"
                      className="border-destructive bg-card"
                    >
                      <div className="flex w-full flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <IconPrinterOff className="size-4 shrink-0 text-destructive" />
                            <span className="truncate text-sm font-semibold text-foreground">
                              {getJobTypeLabel(job.job_type)} #{job.id}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatVNTime(job.created_at)}
                          </span>
                        </div>

                        {job.last_error ? (
                          <p className="line-clamp-2 text-xs text-destructive">
                            {job.last_error}
                          </p>
                        ) : (
                          <p className="text-xs text-destructive">
                            {t.expiredJobFallback}
                          </p>
                        )}

                        <ItemFooter className="mt-1 flex w-full items-center justify-end gap-2 border-t border-border/60 pt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleDismissJob(job.id)}
                          >
                            <IconDismiss data-icon="inline-start" className="size-3" />
                            {t.dismissAction}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={retryingJobId === job.id}
                            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-semibold"
                            onClick={() => handleRetryJob(job.id)}
                          >
                            {retryingJobId === job.id ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <IconRetry data-icon="inline-start" className="size-3" />
                            )}
                            {t.retryAction}
                          </Button>
                        </ItemFooter>
                      </div>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </div>

            {/* Recent Completed Jobs */}
            {recentJobs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.recentJobsTitle}
                </span>
                <ItemGroup className="gap-1.5">
                  {recentJobs.map((job) => (
                    <Item key={job.id} variant="outline" size="sm" className="bg-card py-2">
                      <div className="flex w-full items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <IconCheck className="size-3.5 shrink-0 text-success" />
                          <span className="font-medium text-foreground">
                            {getJobTypeLabel(job.job_type)} #{job.id}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {job.printed_at ? formatVNTime(job.printed_at) : formatVNTime(job.created_at)}
                        </span>
                      </div>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoadingDetails}
            onClick={() => {
              void loadDetails();
              onRefresh();
            }}
          >
            {isLoadingDetails ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconRefresh data-icon="inline-start" className="size-4" />
            )}
            {t.refreshAction}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t.closeAction}
          </Button>
        </div>
      </div>
    </StationSheet>
  );
}
