import { z } from "zod";

export const FEEDBACK_TOKEN_LENGTH = 14;
export const FEEDBACK_TOKEN_REGEX = /^[A-Za-z0-9_-]{14}$/;
export const FEEDBACK_COMMENT_MAX = 2000;
export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;
export const FEEDBACK_MUTATION_HEADER = "x-feedback-request";
export const FEEDBACK_PAGE_SIZE = 50;

export const feedbackTokenSchema = z
  .string()
  .regex(FEEDBACK_TOKEN_REGEX, "invalid_token");

export const feedbackSubmitRequestSchema = z.object({
  clientSubmissionId: z.string().uuid(),
  rating: z.number().int().min(FEEDBACK_RATING_MIN).max(FEEDBACK_RATING_MAX),
  comment: z
    .string()
    .trim()
    .max(FEEDBACK_COMMENT_MAX)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  website: z.string().optional(),
});

export type FeedbackSubmitRequest = z.infer<typeof feedbackSubmitRequestSchema>;

export const createFeedbackQrSchema = z.object({
  branchId: z.number().int().positive(),
  tableId: z.number().int().positive().nullable().optional(),
  label: z.string().trim().min(1).max(200),
});

export const rotateFeedbackQrSchema = z.object({
  qrCodeId: z.number().int().positive(),
  branchId: z.number().int().positive(),
});

export const deactivateFeedbackQrSchema = rotateFeedbackQrSchema;

export function generateFeedbackToken(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = new Uint8Array(FEEDBACK_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export function feedbackPublicUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/r/${token}`;
}
