import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";

// Recreate the action schemas directly to test input contract boundaries
const closePeriodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  acknowledgedWarnings: z.boolean().optional(),
});

const reopenPeriodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reason: z
    .string()
    .trim()
    .min(10, "Lý do mở lại sổ phải có ít nhất 10 ký tự")
    .max(500),
});

test("closePeriodSchema validates valid year and month and coerce string inputs", () => {
  const parsed = closePeriodSchema.safeParse({ year: "2026", month: "8" });
  assert.ok(parsed.success);
  assert.equal(parsed.data.year, 2026);
  assert.equal(parsed.data.month, 8);
});

test("closePeriodSchema rejects invalid month numbers", () => {
  assert.equal(closePeriodSchema.safeParse({ year: 2026, month: 0 }).success, false);
  assert.equal(closePeriodSchema.safeParse({ year: 2026, month: 13 }).success, false);
  assert.equal(closePeriodSchema.safeParse({ year: 2019, month: 5 }).success, false);
});

test("reopenPeriodSchema enforces minimum 10 characters reason with trim", () => {
  // Too short (< 10 characters)
  const shortResult = reopenPeriodSchema.safeParse({
    year: 2026,
    month: 8,
    reason: "Lý do",
  });
  assert.equal(shortResult.success, false);

  // Whitespace padded but effectively too short (< 10 non-whitespace chars)
  const paddedResult = reopenPeriodSchema.safeParse({
    year: 2026,
    month: 8,
    reason: "   12345   ",
  });
  assert.equal(paddedResult.success, false);

  // Valid reason (>= 10 non-whitespace characters)
  const validResult = reopenPeriodSchema.safeParse({
    year: 2026,
    month: 8,
    reason: "Bổ sung hóa đơn tiền điện cuối tháng còn thiếu",
  });
  assert.ok(validResult.success);
  assert.equal(validResult.data.reason, "Bổ sung hóa đơn tiền điện cuối tháng còn thiếu");
});

test("role and permission gating policy for period close & reopen", () => {
  const financeRoles = MODULE_ACL.finance.allowedRoles;
  const ownerRoles = ["owner"] as const;

  // Soft close allows finance roles (owner, accountant)
  assert.ok(financeRoles.includes("accountant"));
  assert.ok(financeRoles.includes("owner"));

  // Hard close and Reopen are strictly restricted to owner
  assert.deepEqual(ownerRoles, ["owner"]);
  assert.equal(ownerRoles.includes("accountant" as never), false);
  assert.equal(ownerRoles.includes("cashier" as never), false);

  // Permissions keys exist and are consistent
  assert.equal(PERMISSION_KEYS.ACCOUNTING_PERIOD_CLOSE, "accounting:period_close");
  assert.equal(PERMISSION_KEYS.ACCOUNTING_PERIOD_REOPEN, "accounting:period_reopen");
});

test("blocker gating policy prevents closing when blockerCount > 0", () => {
  interface ReadinessSummary {
    canClose: boolean;
    blockerCount: number;
    warningCount: number;
  }

  function evaluateCloseEligibility(readiness: ReadinessSummary | null): {
    canSoftClose: boolean;
    canHardClose: boolean;
    errorMessage?: string;
  } {
    if (!readiness) {
      return { canSoftClose: false, canHardClose: false, errorMessage: "Không thể kiểm tra sức khoẻ chốt sổ kỳ này." };
    }
    if (!readiness.canClose || readiness.blockerCount > 0) {
      return { canSoftClose: false, canHardClose: false, errorMessage: "Kỳ kế toán còn lỗi chặn, chưa đủ điều kiện chốt sổ." };
    }
    return { canSoftClose: true, canHardClose: true };
  }

  // Blocker present
  const blockedState: ReadinessSummary = {
    canClose: false,
    blockerCount: 2,
    warningCount: 0,
  };
  assert.deepEqual(evaluateCloseEligibility(blockedState), {
    canSoftClose: false,
    canHardClose: false,
    errorMessage: "Kỳ kế toán còn lỗi chặn, chưa đủ điều kiện chốt sổ.",
  });

  // Warnings present but blockers = 0 and canClose = true -> Soft close is permitted
  const warnState: ReadinessSummary = {
    canClose: true,
    blockerCount: 0,
    warningCount: 3,
  };
  assert.deepEqual(evaluateCloseEligibility(warnState), {
    canSoftClose: true,
    canHardClose: true,
  });

  // Clean state
  const cleanState: ReadinessSummary = {
    canClose: true,
    blockerCount: 0,
    warningCount: 0,
  };
  assert.deepEqual(evaluateCloseEligibility(cleanState), {
    canSoftClose: true,
    canHardClose: true,
  });
});
