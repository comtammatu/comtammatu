/**
 * Hand-coded TypeScript shapes for the feedback module DB schema.
 *
 * Mirrors what `supabase gen types` would emit for these tables. Will be
 * superseded the next time `pnpm db:types` runs against a project that has
 * the 20260511* migrations applied — at that point this file should be
 * deleted and downstream imports re-pointed at the generated `Database`.
 *
 * Source migrations:
 *   supabase/migrations/20260511000000_feedback_create_tables.sql
 *   supabase/migrations/20260511010000_feedback_rls_policies.sql
 *   supabase/migrations/20260511020000_feedback_masked_phone_view.sql
 *   supabase/migrations/20260511030000_submit_feedback_rpc.sql
 *   supabase/migrations/20260511040000_feedback_permission_keys.sql
 */

export type FeedbackChannel = "qr_scan" | "manual";
export type AiSeverity = "low" | "medium" | "high" | "critical";
export type TelegramOutboxStatus = "pending" | "sent" | "failed" | "dead";

export type FeedbackCategory =
  | "food.quality.cold"
  | "food.quality.raw"
  | "food.quality.spoiled"
  | "food.quality.taste"
  | "food.quality.portion"
  | "service.slow"
  | "service.attitude"
  | "service.wrong_order"
  | "service.missing_item"
  | "hygiene.dirty_table"
  | "hygiene.bug"
  | "hygiene.smell"
  | "hygiene.toilet"
  | "pricing.overcharged"
  | "pricing.unclear"
  | "ambience.noise"
  | "ambience.crowded"
  | "ambience.aircon"
  | "ambience.parking"
  | "praise.food"
  | "praise.service"
  | "praise.value"
  | "suggestion.menu"
  | "suggestion.facility"
  | "other";

export type FeedbackTables = {
  feedback_qr_codes: {
    Row: {
      id: number;
      tenant_id: number;
      branch_id: number;
      table_id: number | null;
      token: string;
      label: string;
      is_active: boolean;
      created_by: number | null;
      created_at: string;
      rotated_at: string | null;
    };
    Insert: {
      id?: number;
      tenant_id: number;
      branch_id: number;
      table_id?: number | null;
      token: string;
      label: string;
      is_active?: boolean;
      created_by?: number | null;
      created_at?: string;
      rotated_at?: string | null;
    };
    Update: {
      id?: number;
      tenant_id?: number;
      branch_id?: number;
      table_id?: number | null;
      token?: string;
      label?: string;
      is_active?: boolean;
      created_by?: number | null;
      created_at?: string;
      rotated_at?: string | null;
    };
    Relationships: [];
  };
  feedbacks: {
    Row: {
      id: number;
      tenant_id: number;
      branch_id: number;
      table_id: number | null;
      qr_code_id: number;
      rating: number;
      comment: string;
      photo_paths: string[];
      phone: string | null;
      channel: FeedbackChannel;
      order_id_snapshot: number | null;
      order_total_snapshot: number | null;
      dish_names_snapshot: string[] | null;
      server_user_id_snapshot: number | null;
      submit_ip_hash: string | null;
      user_agent_short: string | null;
      is_suspect: boolean;
      alert_sent_telegram_at: string | null;
      alert_priority: number;
      ai_processed_at: string | null;
      ai_categories: FeedbackCategory[] | null;
      ai_severity: AiSeverity | null;
      ai_summary_vi: string | null;
      ai_sentiment_score: number | null;
      created_at: string;
    };
    Insert: {
      id?: number;
      tenant_id: number;
      branch_id: number;
      table_id?: number | null;
      qr_code_id: number;
      rating: number;
      comment: string;
      photo_paths?: string[];
      phone?: string | null;
      channel?: FeedbackChannel;
      order_id_snapshot?: number | null;
      order_total_snapshot?: number | null;
      dish_names_snapshot?: string[] | null;
      server_user_id_snapshot?: number | null;
      submit_ip_hash?: string | null;
      user_agent_short?: string | null;
      is_suspect?: boolean;
      alert_sent_telegram_at?: string | null;
      alert_priority?: number;
      ai_processed_at?: string | null;
      ai_categories?: FeedbackCategory[] | null;
      ai_severity?: AiSeverity | null;
      ai_summary_vi?: string | null;
      ai_sentiment_score?: number | null;
      created_at?: string;
    };
    Update: {
      id?: number;
      tenant_id?: number;
      branch_id?: number;
      table_id?: number | null;
      qr_code_id?: number;
      rating?: number;
      comment?: string;
      photo_paths?: string[];
      phone?: string | null;
      channel?: FeedbackChannel;
      order_id_snapshot?: number | null;
      order_total_snapshot?: number | null;
      dish_names_snapshot?: string[] | null;
      server_user_id_snapshot?: number | null;
      submit_ip_hash?: string | null;
      user_agent_short?: string | null;
      is_suspect?: boolean;
      alert_sent_telegram_at?: string | null;
      alert_priority?: number;
      ai_processed_at?: string | null;
      ai_categories?: FeedbackCategory[] | null;
      ai_severity?: AiSeverity | null;
      ai_summary_vi?: string | null;
      ai_sentiment_score?: number | null;
      created_at?: string;
    };
    Relationships: [];
  };
  telegram_destinations: {
    Row: {
      id: number;
      tenant_id: number;
      branch_id: number | null;
      chat_id: string;
      label: string;
      is_active: boolean;
      consecutive_failures: number;
      created_by: number | null;
      created_at: string;
    };
    Insert: {
      id?: number;
      tenant_id: number;
      branch_id?: number | null;
      chat_id: string;
      label: string;
      is_active?: boolean;
      consecutive_failures?: number;
      created_by?: number | null;
      created_at?: string;
    };
    Update: {
      id?: number;
      tenant_id?: number;
      branch_id?: number | null;
      chat_id?: string;
      label?: string;
      is_active?: boolean;
      consecutive_failures?: number;
      created_by?: number | null;
      created_at?: string;
    };
    Relationships: [];
  };
  telegram_outbox: {
    Row: {
      id: number;
      feedback_id: number;
      status: TelegramOutboxStatus;
      attempts: number;
      last_error: string | null;
      next_retry_at: string;
      sent_at: string | null;
      created_at: string;
    };
    Insert: {
      id?: number;
      feedback_id: number;
      status?: TelegramOutboxStatus;
      attempts?: number;
      last_error?: string | null;
      next_retry_at?: string;
      sent_at?: string | null;
      created_at?: string;
    };
    Update: {
      id?: number;
      feedback_id?: number;
      status?: TelegramOutboxStatus;
      attempts?: number;
      last_error?: string | null;
      next_retry_at?: string;
      sent_at?: string | null;
      created_at?: string;
    };
    Relationships: [];
  };
};

export type FeedbackViews = {
  feedbacks_with_masked_phone: {
    Row: {
      id: number;
      tenant_id: number;
      branch_id: number;
      table_id: number | null;
      qr_code_id: number;
      rating: number;
      comment: string;
      photo_paths: string[];
      phone: string | null;
      channel: FeedbackChannel;
      order_id_snapshot: number | null;
      order_total_snapshot: number | null;
      dish_names_snapshot: string[] | null;
      server_user_id_snapshot: number | null;
      has_ip_hash: boolean | null;
      is_suspect: boolean;
      alert_sent_telegram_at: string | null;
      alert_priority: number;
      ai_processed_at: string | null;
      ai_categories: FeedbackCategory[] | null;
      ai_severity: AiSeverity | null;
      ai_summary_vi: string | null;
      ai_sentiment_score: number | null;
      created_at: string;
    };
    Relationships: [];
  };
};

export type PushMode = "threshold" | "all" | "none";

export type FeedbackDailyReportsTables = {
  feedback_daily_reports: {
    Row: {
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
    };
    Insert: {
      id?: number;
      tenant_id: number;
      branch_id?: number | null;
      report_date: string;
      feedback_count?: number;
      avg_rating?: number | null;
      report_md: string;
      metrics_json?: Record<string, unknown>;
      llm_model: string;
      llm_cost_usd?: number;
      generated_at?: string;
    };
    Update: {
      id?: number;
      tenant_id?: number;
      branch_id?: number | null;
      report_date?: string;
      feedback_count?: number;
      avg_rating?: number | null;
      report_md?: string;
      metrics_json?: Record<string, unknown>;
      llm_model?: string;
      llm_cost_usd?: number;
      generated_at?: string;
    };
    Relationships: [];
  };
  feedback_settings: {
    Row: {
      tenant_id: number;
      ai_monthly_budget_usd: number;
      push_mode: PushMode;
      threshold_rating: number;
      daily_report_hour_local: number;
      updated_at: string;
      updated_by: number | null;
    };
    Insert: {
      tenant_id: number;
      ai_monthly_budget_usd?: number;
      push_mode?: PushMode;
      threshold_rating?: number;
      daily_report_hour_local?: number;
      updated_at?: string;
      updated_by?: number | null;
    };
    Update: {
      tenant_id?: number;
      ai_monthly_budget_usd?: number;
      push_mode?: PushMode;
      threshold_rating?: number;
      daily_report_hour_local?: number;
      updated_at?: string;
      updated_by?: number | null;
    };
    Relationships: [];
  };
};

export type FeedbackFunctions = {
  submit_feedback: {
    Args: {
      p_token: string;
      p_rating: number;
      p_comment: string;
      p_phone?: string | null;
      p_photo_paths?: string[];
      p_ip_hash?: string | null;
      p_user_agent_short?: string | null;
    };
    Returns: number;
  };
  feedback_validate_categories: {
    Args: { p_cats: string[] };
    Returns: boolean;
  };
  feedback_retention_cleanup: {
    Args: Record<string, never>;
    Returns: {
      phone_nulled: number;
      ip_nulled: number;
      text_deleted: number;
      outbox_deleted: number;
    };
  };
  bulk_mark_feedback_suspect: {
    Args: { p_feedback_ids: number[]; p_is_suspect: boolean };
    Returns: number;
  };
};
