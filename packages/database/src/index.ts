import type { Database as GeneratedDatabase } from "./types/database.types";
import type {
  FeedbackTables,
  FeedbackViews,
  FeedbackFunctions,
  FeedbackDailyReportsTables,
} from "./types/feedback.types";

/**
 * Compose the Supabase-generated Database with hand-coded feedback module
 * types. The feedback overlay is removed once `pnpm db:types` runs against a
 * project with the 20260511* migrations applied.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<
    GeneratedDatabase["public"],
    "Tables" | "Views" | "Functions"
  > & {
    Tables: GeneratedDatabase["public"]["Tables"] & FeedbackTables & FeedbackDailyReportsTables;
    Views: GeneratedDatabase["public"]["Views"] & FeedbackViews;
    Functions: GeneratedDatabase["public"]["Functions"] & FeedbackFunctions;
  };
};

export type { Json } from "./types/database.types";
export type {
  FeedbackChannel,
  AiSeverity,
  TelegramOutboxStatus,
  FeedbackCategory,
  PushMode,
  FeedbackTables,
  FeedbackViews,
  FeedbackFunctions,
  FeedbackDailyReportsTables,
} from "./types/feedback.types";
export type { SupabaseClient } from "@supabase/supabase-js";
export { createClient } from "./supabase/server";
export { createServiceClient } from "./supabase/service";
