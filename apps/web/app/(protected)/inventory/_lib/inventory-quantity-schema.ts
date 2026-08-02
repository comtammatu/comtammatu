import { z } from "zod";

const MAX_SAFE_QUANTITY = Math.floor(Number.MAX_SAFE_INTEGER / 1_000);
const CANONICAL_QUANTITY = /^-?\d+(?:\.\d{1,3})?$/;

const inventoryQuantityValueSchema = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(CANONICAL_QUANTITY, "Số lượng phải có tối đa 3 chữ số thập phân")
      .transform(Number),
  ])
  .refine(Number.isFinite, "Số lượng không hợp lệ")
  .refine(
    (value) => Math.abs(value) <= MAX_SAFE_QUANTITY,
    "Số lượng vượt giới hạn cho phép",
  )
  .refine(
    (value) => Math.abs(value * 1_000 - Math.round(value * 1_000)) < 1e-6,
    "Số lượng phải có tối đa 3 chữ số thập phân",
  );

export const inventoryPositiveQuantitySchema = inventoryQuantityValueSchema.refine(
  (value) => value > 0,
  "Số lượng phải lớn hơn 0",
);

export const inventoryNonnegativeQuantitySchema =
  inventoryQuantityValueSchema.refine(
    (value) => value >= 0,
    "Số lượng không được âm",
  );

export const inventoryNonzeroQuantitySchema = inventoryQuantityValueSchema.refine(
  (value) => value !== 0,
  "Số lượng điều chỉnh phải khác 0",
);
