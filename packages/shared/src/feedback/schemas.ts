import { z } from "zod";
import {
  RATING_MIN,
  RATING_MAX,
  COMMENT_MIN_LENGTH,
  COMMENT_MAX_LENGTH,
  PHONE_REGEX,
  QR_LABEL_MAX_LENGTH,
  TELEGRAM_DEST_LABEL_MAX_LENGTH,
  TELEGRAM_CHAT_ID_MAX_LENGTH,
  FEEDBACK_CATEGORIES,
} from "./constants";
import { sanitizeComment, isCommentLengthValid } from "./sanitize";
import { normalizePhone } from "./phone";
import { isValidFeedbackToken } from "./token";

/**
 * Client-side submit schema — no transforms, so input == output.
 * Used by react-hook-form on the public route. The server action re-validates
 * with `submitFeedbackSchema` (which DOES sanitize/normalize).
 *
 * Why split: react-hook-form 7.72+ propagates the resolver's third generic
 * (TTransformedValues) through `Control`. Mismatched input/output types break
 * generic <TextField control={...}> at call sites.
 */
export const submitFeedbackClientSchema = z.object({
  website: z.string().max(0, "honeypot"),
  rating: z.number().int().min(RATING_MIN).max(RATING_MAX),
  comment: z
    .string()
    .min(COMMENT_MIN_LENGTH, `Phản ánh tối thiểu ${COMMENT_MIN_LENGTH} ký tự`)
    .max(COMMENT_MAX_LENGTH, `Phản ánh tối đa ${COMMENT_MAX_LENGTH} ký tự`),
  phone: z.string(),
  photo_paths: z.array(z.string()).max(3),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackClientSchema>;

/**
 * Server-side submit schema — runs in the server action. Sanitizes comment
 * (HTML strip + length re-check) and normalizes phone to E.164. Runs AFTER
 * client schema, on data already shape-checked.
 */
export const submitFeedbackSchema = z.object({
  website: z.string().max(0, "honeypot").optional().default(""),
  rating: z.number().int().min(RATING_MIN).max(RATING_MAX),
  comment: z
    .string()
    .transform(sanitizeComment)
    .refine(isCommentLengthValid, {
      message: `Phản ánh phải từ ${COMMENT_MIN_LENGTH} đến ${COMMENT_MAX_LENGTH} ký tự`,
    }),
  phone: z
    .string()
    .transform((v) => normalizePhone(v))
    .pipe(z.string().regex(PHONE_REGEX).nullable())
    .optional()
    .default(null),
  photo_paths: z.array(z.string()).max(3).optional().default([]),
});

export type SubmitFeedbackParsed = z.output<typeof submitFeedbackSchema>;

/**
 * QR code creation — label is auto-generated server-side (buildQrLabel).
 * table_id null = general QR for whole branch.
 *
 * Uses z.coerce.number() because shadcn SelectField (<select> under the hood)
 * always stores values as strings. Without coerce, react-hook-form's
 * zodResolver fails with "Invalid input: expected number, received string"
 * the moment user picks a branch.
 */
export const createQrCodeSchema = z.object({
  branch_id: z.coerce.number().int().positive(),
  table_id: z.coerce.number().int().positive().nullable().default(null),
});

export const updateQrCodeLabelSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1).max(QR_LABEL_MAX_LENGTH),
});

export const toggleQrCodeSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.boolean(),
});

export const rotateQrCodeSchema = z.object({
  id: z.number().int().positive(),
});

/** Telegram destination CRUD */
export const createTelegramDestinationSchema = z.object({
  /** null = HQ-level destination (receives from all branches) */
  branch_id: z.coerce.number().int().positive().nullable().default(null),
  chat_id: z.string().min(1).max(TELEGRAM_CHAT_ID_MAX_LENGTH),
  label: z.string().min(1).max(TELEGRAM_DEST_LABEL_MAX_LENGTH),
});

export const toggleTelegramDestinationSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.boolean(),
});

/** Token validation schema for public route param */
export const tokenParamSchema = z.string().refine(isValidFeedbackToken, {
  message: "Token không hợp lệ",
});

/** AI category set — Slice 2 uses this for auto-tagging */
export const aiCategoriesSchema = z.array(z.enum(FEEDBACK_CATEGORIES)).max(5);

/** Feedback AI / push settings upsert (form-driven — coerce string→number) */
export const updateFeedbackSettingsSchema = z.object({
  ai_monthly_budget_usd: z.coerce.number().min(0).max(9999.99),
  push_mode: z.enum(["threshold", "all", "none"]),
  threshold_rating: z.coerce.number().int().min(1).max(5),
  daily_report_hour_local: z.coerce.number().int().min(0).max(23),
});

export type UpdateFeedbackSettingsInput = z.infer<
  typeof updateFeedbackSettingsSchema
>;

/** Trigger daily report — no body, only owner check */
export const triggerDailyReportSchema = z.object({}).optional();
