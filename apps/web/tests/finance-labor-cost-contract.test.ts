import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

const periodLaborCostSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  branchId: z.coerce.number().int().positive().nullable().optional(),
});

const postLaborCostSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  paymentMethod: z.enum(["transfer", "unpaid"]).default("transfer"),
});

test("periodLaborCostSchema validates and coerces year, month, and branchId", () => {
  const result = periodLaborCostSchema.safeParse({ year: "2026", month: "8", branchId: "2" });
  assert.ok(result.success);
  assert.equal(result.data.year, 2026);
  assert.equal(result.data.month, 8);
  assert.equal(result.data.branchId, 2);
});

test("postLaborCostSchema defaults paymentMethod to transfer", () => {
  const result = postLaborCostSchema.safeParse({ year: 2026, month: 8 });
  assert.ok(result.success);
  assert.equal(result.data.paymentMethod, "transfer");
});

test("postLaborCostSchema rejects invalid paymentMethod", () => {
  const result = postLaborCostSchema.safeParse({ year: 2026, month: 8, paymentMethod: "cash" });
  assert.equal(result.success, false);
});

test("labor cost aggregation accurately sums gross and employer insurance per branch", () => {
  interface MockEntry {
    gross_total: number;
    total_insurance_employer: number;
    branchId: number | null;
  }

  const entries: MockEntry[] = [
    { gross_total: 15_000_000, total_insurance_employer: 3_225_000, branchId: 1 },
    { gross_total: 12_000_000, total_insurance_employer: 2_580_000, branchId: 1 },
    { gross_total: 10_000_000, total_insurance_employer: 2_150_000, branchId: 2 },
    { gross_total: 20_000_000, total_insurance_employer: 4_300_000, branchId: null }, // Office
  ];

  const branchAccumulator = new Map<
    string,
    { branchId: number | null; gross: number; insurance: number }
  >();

  for (const entry of entries) {
    const key = entry.branchId != null ? String(entry.branchId) : "office";
    const current = branchAccumulator.get(key) ?? {
      branchId: entry.branchId,
      gross: 0,
      insurance: 0,
    };
    current.gross += entry.gross_total;
    current.insurance += entry.total_insurance_employer;
    branchAccumulator.set(key, current);
  }

  const b1 = branchAccumulator.get("1");
  assert.ok(b1);
  assert.equal(b1.gross, 27_000_000);
  assert.equal(b1.insurance, 5_805_000);
  assert.equal(b1.gross + b1.insurance, 32_805_000);

  const b2 = branchAccumulator.get("2");
  assert.ok(b2);
  assert.equal(b2.gross + b2.insurance, 12_150_000);

  const office = branchAccumulator.get("office");
  assert.ok(office);
  assert.equal(office.gross + office.insurance, 24_300_000);

  const grandTotalLaborCost = Array.from(branchAccumulator.values()).reduce(
    (sum, item) => sum + item.gross + item.insurance,
    0,
  );
  assert.equal(grandTotalLaborCost, 69_255_000);
});

test("expense note tag follows canonical format for idempotency", () => {
  const year = 2026;
  const month = 8;
  const noteTag = `[Lương-T${String(month).padStart(2, "0")}/${year}]`;
  assert.equal(noteTag, "[Lương-T08/2026]");

  const branchName = "Chi nhánh Nguyễn Trãi";
  const fullNote = `${noteTag} ${branchName}`;
  assert.equal(fullNote, "[Lương-T08/2026] Chi nhánh Nguyễn Trãi");
  assert.ok(fullNote.startsWith("[Lương-T08/2026]"));
});

test("labor cost to revenue ratio calculation and benchmark categorization", () => {
  function computeRatio(laborCost: number, netRevenue: number) {
    if (netRevenue <= 0) return { ratio: null, tone: "neutral" as const };
    const ratio = (laborCost / netRevenue) * 100;
    const tone = ratio <= 22 ? ("success" as const) : ("warning" as const);
    return { ratio, tone };
  }

  // 18% ratio -> Safe (<= 22%)
  const safeCase = computeRatio(18_000_000, 100_000_000);
  assert.equal(safeCase.ratio, 18);
  assert.equal(safeCase.tone, "success");

  // 22% exact boundary -> Safe (<= 22%)
  const boundaryCase = computeRatio(22_000_000, 100_000_000);
  assert.equal(boundaryCase.ratio, 22);
  assert.equal(boundaryCase.tone, "success");

  // 25% ratio -> High (> 22%)
  const highCase = computeRatio(25_000_000, 100_000_000);
  assert.equal(highCase.ratio, 25);
  assert.equal(highCase.tone, "warning");

  // Zero revenue -> null ratio, neutral tone
  const zeroRevCase = computeRatio(20_000_000, 0);
  assert.equal(zeroRevCase.ratio, null);
  assert.equal(zeroRevCase.tone, "neutral");
});

test("allPosted flag is true only when every branch has an existing expense", () => {
  const branches = [
    { branchId: 1, laborCost: 30_000_000, postedExpenseId: 101 },
    { branchId: 2, laborCost: 25_000_000, postedExpenseId: null },
  ];

  const allPostedInitial = branches.every((b) => b.postedExpenseId != null);
  assert.equal(allPostedInitial, false);

  // After posting branch 2
  branches[1]!.postedExpenseId = 102;
  const allPostedFinal = branches.every((b) => b.postedExpenseId != null);
  assert.equal(allPostedFinal, true);
});
