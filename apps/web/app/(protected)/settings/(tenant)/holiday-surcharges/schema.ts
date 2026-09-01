import { z } from "zod";

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    error: "Ngày giờ không hợp lệ",
  })
  .refine(
    (value) => {
      const parsed = new Date(`${value}:00+07:00`);
      if (Number.isNaN(parsed.getTime())) return false;

      const vietnamLocal = new Date(parsed.getTime() + 7 * 60 * 60 * 1_000)
        .toISOString()
        .slice(0, 16);
      return vietnamLocal === value;
    },
    {
      error: "Ngày giờ không hợp lệ",
    },
  );

const safeIdStringSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => Number.isSafeInteger(Number(value)) && Number(value) > 0, {
    error: "Mã dữ liệu không hợp lệ",
  });

export const holidaySurchargeFormSchema = z
  .object({
    policy_id: safeIdStringSchema.optional(),
    name: z
      .string()
      .trim()
      .min(3, { error: "Tên chính sách cần ít nhất 3 ký tự" })
      .max(120, { error: "Tên chính sách tối đa 120 ký tự" }),
    branch_scope: z
      .string()
      .refine(
        (value) =>
          value === "tenant" || safeIdStringSchema.safeParse(value).success,
        { error: "Phạm vi áp dụng không hợp lệ" },
      ),
    calculation_type: z.enum(["percentage", "fixed"]),
    value: z
      .string()
      .trim()
      .min(1, { error: "Nhập mức phụ thu" })
      .refine((value) => Number.isFinite(Number(value)), {
        error: "Mức phụ thu không hợp lệ",
      }),
    starts_at_local: localDateTimeSchema,
    ends_at_local: localDateTimeSchema,
    is_active: z.enum(["true", "false"]),
  })
  .superRefine((values, context) => {
    const amount = Number(values.value);

    if (values.calculation_type === "percentage") {
      if (amount <= 0 || amount > 100) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "Tỷ lệ phải lớn hơn 0% và không quá 100%",
        });
      }
    } else if (
      amount <= 0 ||
      amount > 50_000_000 ||
      !Number.isInteger(amount)
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Số tiền phải từ 1đ đến 50.000.000đ và không có phần lẻ",
      });
    }

    if (values.ends_at_local <= values.starts_at_local) {
      context.addIssue({
        code: "custom",
        path: ["ends_at_local"],
        message: "Thời điểm kết thúc phải sau thời điểm bắt đầu",
      });
    }
  });

export type HolidaySurchargeFormValues = z.infer<
  typeof holidaySurchargeFormSchema
>;

export const holidaySurchargePolicySchema = z.object({
  id: z.number().int().positive(),
  branch_id: z.number().int().positive().nullable(),
  branch_name: z.string().nullable(),
  name: z.string(),
  calculation_type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  is_active: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const holidaySurchargePoliciesSchema = z.array(
  holidaySurchargePolicySchema,
);

export type HolidaySurchargePolicy = z.infer<
  typeof holidaySurchargePolicySchema
>;

export interface HolidaySurchargeBranch {
  id: number;
  name: string;
}
