"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { hasMaximumScale } from "@comtammatu/shared/money";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, getAuthContextWithPermission } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  monthStartFromIsoDate,
  normalizeRevenueRewardTiers,
  type RevenueRewardTier,
} from "../_lib/revenue-target";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;
const targetCopy = messages.finance.revenueTargets;
const MAX_TARGET_AMOUNT = 9_999_999_999_999.99;
function scaleTwoAmount(maximum: number) {
  return z
    .union([z.string().trim().min(1), z.number()])
    .refine((value) => hasMaximumScale(String(value), 2), "invalid_money_scale")
    .transform((value) => Number(value))
    .pipe(z.number().finite().positive().max(maximum));
}

const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => monthStartFromIsoDate(value));

const rewardTierSchema = z
  .object({
    threshold_pct: z.coerce.number().positive().max(1000),
    reward_type: z.enum(["fixed_amount", "revenue_percent"]),
    reward_value: scaleTwoAmount(MAX_TARGET_AMOUNT),
  })
  .superRefine((tier, ctx) => {
    if (tier.reward_type === "revenue_percent" && tier.reward_value > 100) {
      ctx.addIssue({ code: "custom", message: "invalid_reward_value" });
    }
  });

const rewardTiersSchema = z
  .array(rewardTierSchema)
  .max(10)
  .superRefine((tiers, ctx) => {
    if (
      new Set(tiers.map((tier) => tier.threshold_pct)).size !== tiers.length
    ) {
      ctx.addIssue({ code: "custom", message: "duplicate_reward_threshold" });
    }
  })
  .transform((tiers) =>
    [...tiers].sort((a, b) => a.threshold_pct - b.threshold_pct),
  );

const upsertRowSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  target_amount: scaleTwoAmount(MAX_TARGET_AMOUNT),
  reward_tiers: rewardTiersSchema.default([]),
});

const upsertSchema = z.object({
  year_month: yearMonthSchema,
  rows: z.array(upsertRowSchema).min(1).max(200),
});

export type BranchRevenueTargetRow = {
  branchId: number;
  branchName: string;
  yearMonth: string;
  targetAmount: number | null;
  priorMonthNetRevenue: number;
  rewardTiers: RevenueRewardTier[];
};

export type BranchRevenueTargetProgressRow = {
  branchId: number;
  branchName: string;
  yearMonth: string;
  netRevenue: number;
  targetAmount: number | null;
  progressPct: number | null;
  gapAmount: number | null;
};

export type BranchRevenueTargetProgress = {
  branchId: number;
  yearMonth: string;
  netRevenueMtd: number;
  netRevenueToday: number;
  targetAmount: number | null;
  progressPct: number | null;
  gapAmount: number | null;
  rewardTiers: RevenueRewardTier[];
};

function parseRewardTiers(value: unknown): RevenueRewardTier[] | null {
  const parsed = rewardTiersSchema.safeParse(value);
  if (!parsed.success) return null;
  return normalizeRevenueRewardTiers(
    parsed.data.map((tier) => ({
      thresholdPct: tier.threshold_pct,
      rewardType: tier.reward_type,
      rewardValue: tier.reward_value,
    })),
  );
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listBranchRevenueTargets(
  yearMonth: string,
): Promise<ActionResult<BranchRevenueTargetRow[]>> {
  const parsed = yearMonthSchema.safeParse(yearMonth);
  if (!parsed.success) {
    return { success: false, error: targetCopy.errors.invalidMonth };
  }

  const ctx = await getAuthContextWithPermission(FINANCE_ROLES, "finance:view");
  if (!ctx) {
    return { success: false, error: targetCopy.errors.forbidden };
  }

  const [targetResult, rewardResult] = await Promise.all([
    ctx.supabase.rpc("list_branch_revenue_targets", {
      p_year_month: parsed.data,
    }),
    ctx.supabase.rpc("list_branch_revenue_target_reward_tiers", {
      p_year_month: parsed.data,
    }),
  ]);

  if (targetResult.error || rewardResult.error) {
    console.error(
      "[finance:targets:list] load failed",
      targetResult.error?.code ?? rewardResult.error?.code,
    );
    return { success: false, error: targetCopy.errors.loadFailed };
  }

  const rewardsByBranch = new Map<number, RevenueRewardTier[]>();
  for (const row of rewardResult.data ?? []) {
    const parsedTiers = rewardTiersSchema.safeParse(row.reward_tiers);
    if (!parsedTiers.success) {
      return { success: false, error: targetCopy.errors.loadFailed };
    }
    const normalized = normalizeRevenueRewardTiers(
      parsedTiers.data.map((tier) => ({
        thresholdPct: tier.threshold_pct,
        rewardType: tier.reward_type,
        rewardValue: tier.reward_value,
      })),
    );
    if (!normalized) {
      return { success: false, error: targetCopy.errors.loadFailed };
    }
    rewardsByBranch.set(toNumber(row.branch_id), normalized);
  }

  const rows = (targetResult.data ?? []).map((row) => {
    const branchId = toNumber(row.branch_id);
    return {
      branchId,
      branchName: row.branch_name,
      yearMonth: row.year_month,
      targetAmount: toNullableNumber(row.target_amount),
      priorMonthNetRevenue: toNumber(row.prior_month_net_revenue),
      rewardTiers: rewardsByBranch.get(branchId) ?? [],
    };
  });

  return { success: true, data: rows };
}

export async function upsertBranchRevenueTargets(
  input: unknown,
): Promise<ActionResult<{ updated: number; yearMonth: string }>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: targetCopy.errors.invalidPayload };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_TARGETS_WRITE,
  );
  if (!ctx) {
    return { success: false, error: targetCopy.errors.forbidden };
  }

  const { data, error } = await ctx.supabase.rpc(
    "upsert_branch_revenue_targets",
    {
      p_year_month: parsed.data.year_month,
      p_rows: parsed.data.rows,
    },
  );

  if (error) {
    console.error("[finance:targets:upsert] RPC failed", error.code);
    return { success: false, error: targetCopy.errors.saveFailed };
  }

  const result = z
    .object({
      updated: z.coerce.number().int().min(0),
      year_month: z.string(),
    })
    .safeParse(data);

  if (!result.success) {
    return { success: false, error: targetCopy.errors.saveFailed };
  }

  revalidatePath("/finance");
  revalidatePath("/finance/revenue");
  revalidatePath("/finance/targets");

  return {
    success: true,
    data: {
      updated: result.data.updated,
      yearMonth: result.data.year_month,
    },
  };
}

export async function deleteBranchRevenueTarget(
  input: unknown,
): Promise<ActionResult<{ deleted: number; yearMonth: string }>> {
  const parsed = z
    .object({
      year_month: yearMonthSchema,
      branch_id: z.coerce.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: targetCopy.errors.invalidPayload };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_TARGETS_WRITE,
  );
  if (!ctx) {
    return { success: false, error: targetCopy.errors.forbidden };
  }

  const { data, error } = await ctx.supabase.rpc(
    "delete_branch_revenue_target" as never,
    {
      p_year_month: parsed.data.year_month,
      p_branch_id: parsed.data.branch_id,
    } as never,
  );

  if (error) {
    console.error("[finance:targets:delete] RPC failed", error.code);
    return { success: false, error: targetCopy.errors.deleteFailed };
  }

  const result = z
    .object({
      deleted: z.coerce.number().int().min(0),
      year_month: z.string(),
    })
    .safeParse(data);
  if (!result.success) {
    return { success: false, error: targetCopy.errors.deleteFailed };
  }

  revalidatePath("/finance");
  revalidatePath("/finance/revenue");
  revalidatePath("/finance/targets");

  return {
    success: true,
    data: {
      deleted: result.data.deleted,
      yearMonth: result.data.year_month,
    },
  };
}

export async function listBranchRevenueTargetProgress(
  yearMonth: string,
): Promise<ActionResult<BranchRevenueTargetProgressRow[]>> {
  const parsed = yearMonthSchema.safeParse(yearMonth);
  if (!parsed.success) {
    return { success: false, error: targetCopy.errors.invalidMonth };
  }

  const ctx = await getAuthContextWithPermission(FINANCE_ROLES, "finance:view");
  if (!ctx) {
    return { success: false, error: targetCopy.errors.forbidden };
  }

  const { data, error } = await ctx.supabase.rpc(
    "list_branch_revenue_target_progress",
    { p_year_month: parsed.data },
  );

  if (error) {
    console.error("[finance:targets:progress] RPC failed", error.code);
    return { success: false, error: targetCopy.errors.loadFailed };
  }

  const rows = (data ?? []).map((row) => ({
    branchId: toNumber(row.branch_id),
    branchName: row.branch_name,
    yearMonth: row.year_month,
    netRevenue: toNumber(row.net_revenue),
    targetAmount: toNullableNumber(row.target_amount),
    progressPct: toNullableNumber(row.progress_pct),
    gapAmount: toNullableNumber(row.gap_amount),
  }));

  return { success: true, data: rows };
}

export async function fetchBranchRevenueTargetProgress(
  branchId: number,
  yearMonth?: string,
): Promise<ActionResult<BranchRevenueTargetProgress | null>> {
  const branchParsed = z.coerce.number().int().positive().safeParse(branchId);
  if (!branchParsed.success) {
    return { success: false, error: targetCopy.errors.invalidBranch };
  }

  const month =
    yearMonth == null
      ? undefined
      : yearMonthSchema.safeParse(yearMonth).success
        ? monthStartFromIsoDate(yearMonth)
        : null;
  if (yearMonth != null && month == null) {
    return { success: false, error: targetCopy.errors.invalidMonth };
  }

  const ctx = await getAuthContext(["owner", "accountant", "branch_manager"]);
  if (!ctx) {
    return { success: false, error: targetCopy.errors.forbidden };
  }

  const role = ctx.claims.user_role;
  if (role === "branch_manager" && ctx.claims.branch_id !== branchParsed.data) {
    return { success: false, error: targetCopy.errors.forbidden };
  }

  const { data, error } = await ctx.supabase.rpc(
    "get_branch_revenue_target_progress",
    {
      p_branch_id: branchParsed.data,
      ...(month ? { p_year_month: month } : {}),
    },
  );

  if (error) {
    console.error("[finance:targets:branch-progress] RPC failed", error.code);
    return { success: false, error: targetCopy.errors.loadFailed };
  }

  const row = data?.[0];
  if (!row) {
    return { success: true, data: null };
  }

  const rewardTiers = parseRewardTiers(row.reward_tiers ?? []);
  if (!rewardTiers) {
    return { success: false, error: targetCopy.errors.loadFailed };
  }

  return {
    success: true,
    data: {
      branchId: toNumber(row.branch_id),
      yearMonth: row.year_month,
      netRevenueMtd: toNumber(row.net_revenue_mtd),
      netRevenueToday: toNumber(row.net_revenue_today),
      targetAmount: toNullableNumber(row.target_amount),
      progressPct: toNullableNumber(row.progress_pct),
      gapAmount: toNullableNumber(row.gap_amount),
      rewardTiers,
    },
  };
}
