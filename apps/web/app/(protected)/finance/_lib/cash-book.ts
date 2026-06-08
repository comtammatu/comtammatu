import { z } from "zod";

/**
 * Sổ quỹ (cash-book) shared model — categories + validation.
 *
 * Plain module (NOT "use server") so both the client dialog and the
 * server action can import the schema + category lists. Per HKD lean: the
 * `cash_entries` table is append-only by design (RLS ships SELECT+INSERT
 * policies only, no UPDATE/DELETE) — a wrong entry is corrected by a new
 * opposite entry, not an edit.
 *
 * Categories are centralised here so adding/renaming one is a single edit.
 */

/** Hạng mục CHI (cash-out). */
export const CASH_OUT_CATEGORIES = [
  { value: "mua_nguyen_lieu", label: "Mua nguyên liệu" },
  { value: "tra_ncc", label: "Trả nhà cung cấp" },
  { value: "dien_nuoc", label: "Điện nước" },
  { value: "thue_mat_bang", label: "Thuê mặt bằng" },
  { value: "luong_tam_ung", label: "Lương / tạm ứng" },
  { value: "gas_chat_dot", label: "Gas / chất đốt" },
  { value: "sua_chua", label: "Sửa chữa / bảo trì" },
  { value: "chi_khac", label: "Chi khác" },
] as const;

/** Hạng mục THU (cash-in). */
export const CASH_IN_CATEGORIES = [
  { value: "doanh_thu_ban_hang", label: "Doanh thu bán hàng" },
  { value: "gop_von", label: "Góp vốn / chủ nạp" },
  { value: "thu_khac", label: "Thu khác" },
] as const;

export type CashDirection = "in" | "out";

/** Categories shown for a given direction (the dialog filters by this). */
export function categoriesFor(
  direction: CashDirection,
): readonly { value: string; label: string }[] {
  return direction === "in" ? CASH_IN_CATEGORIES : CASH_OUT_CATEGORIES;
}

const ALL_CATEGORIES = [...CASH_OUT_CATEGORIES, ...CASH_IN_CATEGORIES];
const CATEGORY_VALUE_SET = new Set<string>(ALL_CATEGORIES.map((c) => c.value));
const CATEGORY_LABELS = new Map<string, string>(
  ALL_CATEGORIES.map((c) => [c.value, c.label]),
);

/** Human label for a stored category value (falls back to the raw value). */
export function cashCategoryLabel(value: string | null): string {
  if (!value) return "—";
  return CATEGORY_LABELS.get(value) ?? value;
}

/**
 * Canonical cash-entry input. `amount` is a string (the formatted-number
 * input binds a string); the action converts it with `Number()` after
 * validation. VND has no minor unit so the UI locks fraction digits to 0.
 */
export const cashEntrySchema = z.object({
  branchId: z.coerce.number().int().positive(),
  direction: z.enum(["in", "out"]),
  amount: z
    .string()
    .trim()
    .min(1, { error: "Nhập số tiền" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0;
      },
      { error: "Số tiền phải lớn hơn 0" },
    ),
  category: z
    .string()
    .trim()
    .min(1, { error: "Chọn hạng mục" })
    .refine((v) => CATEGORY_VALUE_SET.has(v), {
      error: "Hạng mục không hợp lệ",
    }),
  note: z.string().trim().max(500, { error: "Ghi chú quá dài" }).optional(),
  entryDate: z.string().date().optional(),
});

export type CashEntryInput = z.infer<typeof cashEntrySchema>;

/** One row as returned by `fetchCashEntries`. */
export interface CashEntryRow {
  id: number;
  entry_date: string;
  direction: CashDirection;
  category: string | null;
  amount: number;
  note: string | null;
  created_at: string;
}
