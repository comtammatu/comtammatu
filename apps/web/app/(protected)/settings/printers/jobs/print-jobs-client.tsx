"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import { PRINT_JOB_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppListFrame, AppToolbar } from "@/components/surface";
import {
  RefreshCw as IconRefresh,
  RotateCcw as IconRotate,
} from "lucide-react";
import { messages } from "@lib/messages";
import { retryJobFromMonitor } from "./actions";

export type JobRow = {
  id: number;
  branch_id: number;
  printer_id: number;
  job_type: string;
  status: string;
  attempts: number;
  retry_count: number;
  last_error: string | null;
  last_retried_at: string | null;
  created_at: string;
  printed_at: string | null;
  claimed_by_agent: string | null;
  printer_role?: string | null;
  printer_name?: string | null;
};

export type BranchOption = { id: number; name: string };

interface Props {
  jobs: JobRow[];
  branches: BranchOption[];
  filterBranch: number | null;
  filterStatus: string | null;
  filterJobType: string | null;
  currentBranchLocked: boolean;
}

const PRINT_JOB_ATTENTION_STATUS = "needs_attention";
const PRINT_JOBS_COPY = messages.settings.printers;
type PrintJobTypeKey = keyof typeof PRINT_JOBS_COPY.jobTypes;

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return formatVNDateTime(iso);
}

function getJobTypeLabel(jobType: string): string {
  return PRINT_JOBS_COPY.jobTypes[jobType as PrintJobTypeKey] ?? jobType;
}

export function PrintJobsClient({
  jobs,
  branches,
  filterBranch,
  filterStatus,
  filterJobType,
  currentBranchLocked,
}: Props) {
  const router = useRouter();
  const [pendingJobId, setPendingJobId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(window.location.search);
    if (value == null || value === "" || value === "all") sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?");
  };

  const handleRetry = (id: number) => {
    setPendingJobId(id);
    startTransition(async () => {
      const r = await retryJobFromMonitor(id);
      setPendingJobId(null);
      if (r.success) {
        toast.success(PRINT_JOBS_COPY.retrySuccess(id));
        router.refresh();
      } else {
        toast.error(r.error ?? PRINT_JOBS_COPY.retryFailed);
      }
    });
  };

  function RetryAction({ job }: { job: JobRow }) {
    const canRetry = job.status === "failed" || job.status === "expired";
    if (!canRetry) return null;

    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending && pendingJobId === job.id}
        onClick={() => handleRetry(job.id)}
      >
        <IconRotate className="size-3.5" />
        {ACTIONS_VI.retry}
      </Button>
    );
  }

  const columns: DataTableColumn<JobRow>[] = [
    {
      key: "id",
      header: "#",
      className: "font-mono text-xs",
      render: (job) => job.id,
    },
    {
      key: "type",
      header: FORM_VI.type,
      render: (job) => getJobTypeLabel(job.job_type),
    },
    {
      key: "printer",
      header: PRINT_JOBS_COPY.printerColumn,
      render: (job) => (
        <div className="text-xs">
          <div>{job.printer_name ?? `#${job.printer_id}`}</div>
          {job.printer_role ? (
            <div className="text-muted-foreground">{job.printer_role}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (job) => <StatusBadge domain="print-job" value={job.status} />,
    },
    {
      key: "attempts",
      header: PRINT_JOBS_COPY.attemptsColumn,
      className: "text-right text-xs font-mono tabular-nums",
      render: (job) => (
        <>
          {job.attempts}
          {job.retry_count > 0 ? (
            <span className="text-muted-foreground"> (+{job.retry_count})</span>
          ) : null}
        </>
      ),
    },
    {
      key: "created_at",
      header: PRINT_JOBS_COPY.createdAtColumn,
      className: "text-xs text-muted-foreground",
      render: (job) => formatTime(job.created_at),
    },
    {
      key: "printed_at",
      header: PRINT_JOBS_COPY.printedAtColumn,
      className: "text-xs text-muted-foreground",
      render: (job) => formatTime(job.printed_at),
    },
    {
      key: "last_error",
      header: PRINT_JOBS_COPY.errorColumn,
      className: "max-w-xs truncate text-xs text-destructive",
      render: (job) => (
        <span title={job.last_error ?? ""}>{job.last_error ?? ""}</span>
      ),
    },
    {
      key: "actions",
      header: PRINT_JOBS_COPY.actionColumn,
      className: "text-right",
      render: (job) => <RetryAction job={job} />,
    },
  ];

  const filterSelects = (
    <>
      {!currentBranchLocked && branches.length > 1 ? (
        <Select
          value={filterBranch != null ? String(filterBranch) : "all"}
          onValueChange={(value) =>
            updateParam("branch", value === "all" ? null : value)
          }
        >
          <SelectTrigger size="field" className="min-w-36" aria-label={BRANCH_VI.selectAll}>
            <SelectValue placeholder={BRANCH_VI.selectAll} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={String(branch.id)}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Select
        value={filterStatus ?? "all"}
        onValueChange={(value) =>
          updateParam("status", value === "all" ? null : value)
        }
      >
        <SelectTrigger
          size="field"
          className="min-w-36"
          aria-label={PRINT_JOBS_COPY.statusPlaceholder}
        >
          <SelectValue placeholder={PRINT_JOBS_COPY.statusPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{PRINT_JOBS_COPY.allStatuses}</SelectItem>
          <SelectItem value={PRINT_JOB_ATTENTION_STATUS}>
            {PRINT_JOBS_COPY.attentionStatus}
          </SelectItem>
          {Object.entries(PRINT_JOB_STATUS_LABELS_VI).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filterJobType ?? "all"}
        onValueChange={(value) =>
          updateParam("job_type", value === "all" ? null : value)
        }
      >
        <SelectTrigger
          size="field"
          className="min-w-36"
          aria-label={PRINT_JOBS_COPY.jobTypePlaceholder}
        >
          <SelectValue placeholder={PRINT_JOBS_COPY.jobTypePlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{PRINT_JOBS_COPY.allJobTypes}</SelectItem>
          {Object.entries(PRINT_JOBS_COPY.jobTypes).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <AppListFrame
      toolbar={
        <AppToolbar
          variant="inline"
          filters={filterSelects}
          actions={
            <Button variant="outline" size="sm" onClick={() => router.refresh()}>
              <IconRefresh className="size-3.5" />
              {ACTIONS_VI.refresh}
            </Button>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={jobs}
        getRowKey={(job) => job.id}
        pageSize={50}
        emptyTitle={PRINT_JOBS_COPY.emptyJobs}
        mobileCardRender={(job) => (
          <Item variant="outline">
            <ItemHeader>
              <ItemTitle>#{job.id}</ItemTitle>
              <StatusBadge domain="print-job" value={job.status} />
            </ItemHeader>
            <ItemContent>
              <ItemDescription>{getJobTypeLabel(job.job_type)}</ItemDescription>
              <ItemDescription>
                {job.printer_name ?? `#${job.printer_id}`}
                {job.printer_role ? ` · ${job.printer_role}` : ""}
              </ItemDescription>
              <ItemDescription>
                {PRINT_JOBS_COPY.createdAtColumn}: {formatTime(job.created_at)}
              </ItemDescription>
              <ItemDescription>
                {PRINT_JOBS_COPY.printedAtColumn}: {formatTime(job.printed_at)}
              </ItemDescription>
              {job.last_error ? (
                <ItemDescription className="text-destructive">
                  {job.last_error}
                </ItemDescription>
              ) : null}
            </ItemContent>
            <ItemFooter>
              <span className="font-mono text-xs text-muted-foreground">
                {PRINT_JOBS_COPY.attemptsColumn}: {job.attempts}
                {job.retry_count > 0 ? ` (+${job.retry_count})` : ""}
              </span>
              <ItemActions>
                <RetryAction job={job} />
              </ItemActions>
            </ItemFooter>
          </Item>
        )}
      />
    </AppListFrame>
  );
}
