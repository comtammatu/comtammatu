export interface AccessibleBranch {
  id: number;
  name: string;
}

export interface SummaryQueueRow {
  id: number;
  branch_id: number;
  summary_date: string;
  status: "queued" | "running" | "issued" | "failed" | "skipped";
  trigger_source: "cron" | "manual";
  triggered_by: string | null;
  attempt_count: number;
  last_error: string | null;
  tax_invoice_id: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
