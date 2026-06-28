// Templated field-validation messages (Vietnamese). The field LABEL is supplied
// by the caller (often domain-specific); only the recurring suffix is shared,
// so a label like "Đơn vị" stays in the calling module while the wording is
// centralized. Use in Zod schemas:
//   z.string().min(1, { error: VALIDATION_VI.required("Đơn vị") })
//   z.number().positive({ error: VALIDATION_VI.positive("Số lượng") })
export const VALIDATION_VI = {
  required: (label: string) => `${label} không được để trống`,
  positive: (label: string) => `${label} phải lớn hơn 0`,
  nonNegative: (label: string) => `${label} không được âm`,
  invalid: (label: string) => `${label} không hợp lệ`,
} as const;

export type ValidationKey = keyof typeof VALIDATION_VI;
