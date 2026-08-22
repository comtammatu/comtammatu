import "server-only";
import {
  SYSTEM_SETTING_KEYS,
  resolveTtsConfigFromRows,
  type ResolvedTtsConfig,
} from "@comtammatu/shared/settings";

export type { ResolvedTtsConfig };

// Structural query interface matching SupabaseClient / PostgrestFilterBuilder
export interface TtsSettingsQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        in(
          column: string,
          values: string[],
        ): PromiseLike<{ data: Array<{ key: string; value: string }> | null }>;
      };
    };
  };
}

export async function resolveTtsConfig(
  supabase: TtsSettingsQueryClient,
  branchId?: number | null,
  tenantId?: number | null,
): Promise<ResolvedTtsConfig> {
  let branchRows: Array<{ key: string; value: string }> | null = null;
  let tenantRows: Array<{ key: string; value: string }> | null = null;

  if (branchId && Number.isInteger(branchId) && branchId > 0) {
    try {
      const { data } = await supabase
        .from("branch_settings")
        .select("key, value")
        .eq("branch_id", branchId)
        .in("key", [
          SYSTEM_SETTING_KEYS.TTS_MODEL,
          SYSTEM_SETTING_KEYS.TTS_VOICE,
        ]);
      branchRows = data;
    } catch {
      // Table might not exist yet or query failed; proceed to tenant fallback.
    }
  }

  if (tenantId && Number.isInteger(tenantId) && tenantId > 0) {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .eq("tenant_id", tenantId)
        .in("key", [
          SYSTEM_SETTING_KEYS.TTS_MODEL,
          SYSTEM_SETTING_KEYS.TTS_VOICE,
        ]);
      tenantRows = data;
    } catch {
      // Fallback
    }
  }

  return resolveTtsConfigFromRows({ branchRows, tenantRows });
}
