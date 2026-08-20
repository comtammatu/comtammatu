import "server-only";

import { STAFF_VI } from "@comtammatu/shared/messages";
import type { createClient } from "@comtammatu/database/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Visible staff label from `profiles.full_name`. Never returns a raw UUID.
 * glossary: STAFF_VI.long ("Nhân viên").
 */
export function staffDisplayLabel(
  name: string | null | undefined,
  fallback: string = STAFF_VI.long,
): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || UUID_RE.test(trimmed)) return fallback;
  return trimmed;
}

/** Map auth user / profile ids to `profiles.full_name` labels (UUID-safe). */
export async function resolveProfileDisplayNames(
  supabase: SupabaseServerClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(userIds.filter((id) => id.length > 0)),
  ];
  if (ids.length === 0) return new Map();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const names = new Map<string, string>();
  for (const profile of profiles ?? []) {
    const label = staffDisplayLabel(profile.full_name, "");
    if (label) names.set(profile.id, label);
  }
  return names;
}
