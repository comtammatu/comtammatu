/**
 * Parser and loader for the read-only period-close readiness RPC
 * (`get_finance_period_close_readiness`). Advisory only: the payload never
 * mutates `accounting_periods` and surfaces no close/reopen action.
 */
import type { loadAuthState } from "@/_lib/auth";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

export interface PeriodReadinessFinding {
  code: string;
  branches?: number[];
  count?: number;
}

export interface PeriodReadinessRpc {
  periodStatus: string;
  valuationActive: boolean;
  blockerCount: number;
  warningCount: number;
  canClose: boolean;
  blockers: PeriodReadinessFinding[];
  warnings: PeriodReadinessFinding[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  let payload: unknown = value;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function wholeCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

/**
 * Unknown finding shapes are skipped, not fatal: a new RPC field must never
 * blank the whole readiness surface during a deploy window.
 */
function parseFinding(raw: unknown): PeriodReadinessFinding | null {
  const row = asRecord(raw);
  if (!row) return null;
  const code = row.code;
  if (typeof code !== "string" || code.length === 0) return null;
  const finding: PeriodReadinessFinding = { code };
  if (row.branches !== undefined) {
    if (!Array.isArray(row.branches)) return null;
    const branches: number[] = [];
    for (const entry of row.branches) {
      const branchId = wholeCount(entry);
      if (branchId == null || branchId === 0) return null;
      branches.push(branchId);
    }
    finding.branches = branches;
  }
  if (row.count !== undefined) {
    const count = wholeCount(row.count);
    if (count == null) return null;
    finding.count = count;
  }
  return finding;
}

function parseFindings(raw: unknown): PeriodReadinessFinding[] | null {
  if (!Array.isArray(raw)) return null;
  const findings: PeriodReadinessFinding[] = [];
  for (const entry of raw) {
    const finding = parseFinding(entry);
    if (finding != null) findings.push(finding);
  }
  return findings;
}

/**
 * Defensive jsonb parser: the payload may arrive as a JSON string depending
 * on the RPC transport. Counts/booleans parse strictly; anything unparseable
 * returns null so the caller stays quiet instead of rendering wrong counts.
 */
export function parsePeriodReadinessRpc(
  raw: unknown,
): PeriodReadinessRpc | null {
  const row = asRecord(raw);
  if (!row) return null;
  const periodStatus = row.period_status;
  if (typeof periodStatus !== "string" || periodStatus.length === 0) {
    return null;
  }
  if (typeof row.valuation_active !== "boolean") return null;
  if (typeof row.can_close !== "boolean") return null;
  const blockerCount = wholeCount(row.blocker_count);
  const warningCount = wholeCount(row.warning_count);
  if (blockerCount == null || warningCount == null) return null;
  const blockers = parseFindings(row.blockers);
  const warnings = parseFindings(row.warnings);
  if (blockers == null || warnings == null) return null;
  return {
    periodStatus,
    valuationActive: row.valuation_active,
    blockerCount,
    warningCount,
    canClose: row.can_close,
    blockers,
    warnings,
  };
}

export async function fetchPeriodReadiness({
  supabase,
  year,
  month,
  branchId,
}: {
  supabase: SupabaseClient;
  year: number;
  month: number;
  branchId: number | null;
}): Promise<PeriodReadinessRpc | null> {
  const { data, error } = await supabase.rpc(
    "get_finance_period_close_readiness",
    {
      p_year: year,
      p_month: month,
      ...(branchId != null ? { p_branch_id: branchId } : {}),
    },
  );
  if (error) {
    console.error("[finance:period-readiness] RPC failed", error.code);
    return null;
  }
  return parsePeriodReadinessRpc(data);
}
