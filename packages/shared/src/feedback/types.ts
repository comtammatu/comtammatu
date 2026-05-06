import type { FeedbackCategory } from "./constants";
import type { AiSeverity } from "../ai/feedback-enrichment";

export type { FeedbackCategory, AiSeverity };

export type FeedbackEnrichmentResult = {
  categories: FeedbackCategory[];
  severity: AiSeverity;
  summary_vi: string;
  sentiment_score: number;
  is_critical_realtime: boolean;
  suggested_action: string;
  llm_model: string;
  llm_cost_usd: number;
};

export type DailyReportRow = {
  id: number;
  tenant_id: number;
  branch_id: number | null;
  report_date: string;
  feedback_count: number;
  avg_rating: number | null;
  report_md: string;
  metrics_json: Record<string, unknown>;
  llm_model: string;
  llm_cost_usd: number;
  generated_at: string;
  branch_name?: string | null;
};

export type FeedbackSettingsRow = {
  tenant_id: number;
  ai_monthly_budget_usd: number;
  push_mode: "threshold" | "all" | "none";
  threshold_rating: number;
  daily_report_hour_local: number;
  updated_at: string;
  updated_by: number | null;
};

export type FeedbackInboxFilter = {
  branch_id?: number | null;
  rating_max?: number;
  include_suspect?: boolean;
  page?: number;
  page_size?: number;
};

export type SubmitFeedbackResult =
  | { ok: true; feedback_id: number }
  | {
      ok: false;
      reason:
        | "token_invalid"
        | "rate_limited"
        | "validation_failed"
        | "internal";
    };

export type TelegramFlushResult = {
  picked: number;
  sent: number;
  failed: number;
  dead: number;
};
