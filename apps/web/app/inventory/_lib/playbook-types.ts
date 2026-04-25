/**
 * Today's Playbook — task feed types.
 *
 * Pure types module: NO Supabase imports. Safe to consume from
 * notification widgets, mobile dashboards, email digest jobs, etc.
 *
 * Each task is a discriminated union member keyed by `kind`. Adding a
 * new task type → also add it to PLAYBOOK_KIND_ORDER and the action
 * switch in playbook-action-buttons.tsx (TS exhaustiveness will yell).
 */

export type PlaybookSeverity = "destructive" | "warning" | "info" | "primary";

export type PlaybookSeverityBucket = "now" | "warning" | "watch";

export interface PlaybookPoRow {
  id: number;
  po_number: string;
  supplier_name: string;
  line_count: number;
  branch_id: number;
}

export interface PlaybookTransferRow {
  id: number;
  transfer_number: string;
  from_branch_name: string;
  to_branch_name: string;
  status: string;
}

export interface PlaybookReorderItem {
  ingredient_id: number;
  name: string;
  current: number;
  reorder: number;
  unit: string;
}

export interface PlaybookExpiryLot {
  ingredient_id: number;
  ingredient_name: string;
  lot: string;
  expiry_date: string;
  days_left: number;
}

export interface PlaybookStocktakeSession {
  id: number;
  branch_id: number;
  branch_name: string;
  progress: number;
  counted: number;
  total: number;
}

export interface PlaybookGrnDraft {
  id: number;
  grn_number: string;
  supplier_name: string;
  branch_id: number;
}

export interface PlaybookPriceReviewLine {
  grn_id: number;
  grn_number: string;
  ingredient_name: string;
  variance_pct: number;
}

export type PlaybookTask =
  | {
      kind: "po_draft_pending";
      severity: PlaybookSeverity;
      branch_id: number;
      pos: PlaybookPoRow[];
    }
  | {
      kind: "reorder_critical";
      severity: PlaybookSeverity;
      branch_id: number;
      branch_kind: "central_warehouse" | "central_kitchen" | "branch";
      ingredients: PlaybookReorderItem[];
    }
  | {
      kind: "transfer_inbound_unconfirmed";
      severity: PlaybookSeverity;
      branch_id: number;
      transfers: PlaybookTransferRow[];
    }
  | {
      kind: "transfer_outbound_pending";
      severity: PlaybookSeverity;
      branch_id: number;
      transfers: PlaybookTransferRow[];
    }
  | {
      kind: "expiry_urgent";
      severity: PlaybookSeverity;
      branch_id: number;
      lots: PlaybookExpiryLot[];
    }
  | {
      kind: "stocktake_in_progress";
      severity: PlaybookSeverity;
      sessions: PlaybookStocktakeSession[];
    }
  | {
      kind: "grn_draft_pending";
      severity: PlaybookSeverity;
      branch_id: number;
      grns: PlaybookGrnDraft[];
    }
  | {
      kind: "price_review_pending";
      severity: PlaybookSeverity;
      lines: PlaybookPriceReviewLine[];
    };

export type PlaybookTaskKind = PlaybookTask["kind"];

/** Display order within the same severity bucket. Lower index = higher priority. */
export const PLAYBOOK_KIND_ORDER: Record<PlaybookTaskKind, number> = {
  reorder_critical: 0,
  expiry_urgent: 1,
  po_draft_pending: 2,
  price_review_pending: 3,
  transfer_inbound_unconfirmed: 4,
  transfer_outbound_pending: 5,
  grn_draft_pending: 6,
  stocktake_in_progress: 7,
};

const SEVERITY_WEIGHT: Record<PlaybookSeverity, number> = {
  destructive: 4,
  warning: 3,
  primary: 2,
  info: 1,
};

export function severityBucket(
  severity: PlaybookSeverity,
): PlaybookSeverityBucket {
  if (severity === "destructive") return "now";
  if (severity === "warning") return "warning";
  return "watch";
}

export function severityBucketLabel(bucket: PlaybookSeverityBucket): string {
  if (bucket === "now") return "Cần xử lý ngay";
  if (bucket === "warning") return "Cảnh báo";
  return "Theo dõi";
}

function taskItemCount(task: PlaybookTask): number {
  switch (task.kind) {
    case "po_draft_pending":
      return task.pos.length;
    case "reorder_critical":
      return task.ingredients.length;
    case "transfer_inbound_unconfirmed":
    case "transfer_outbound_pending":
      return task.transfers.length;
    case "expiry_urgent":
      return task.lots.length;
    case "stocktake_in_progress":
      return task.sessions.length;
    case "grn_draft_pending":
      return task.grns.length;
    case "price_review_pending":
      return task.lines.length;
  }
}

/**
 * Sort by severity (destructive first), then by task count (more items first
 * within the same severity), then by stable kind order.
 */
export function sortPlaybookTasks(tasks: PlaybookTask[]): PlaybookTask[] {
  return [...tasks].sort((a, b) => {
    const sev = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (sev !== 0) return sev;
    const count = taskItemCount(b) - taskItemCount(a);
    if (count !== 0) return count;
    return PLAYBOOK_KIND_ORDER[a.kind] - PLAYBOOK_KIND_ORDER[b.kind];
  });
}
