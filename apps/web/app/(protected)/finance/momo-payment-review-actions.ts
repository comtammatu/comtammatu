"use server";

import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { z } from "zod";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { messages } from "@lib/messages";
import { MOMO_PAYMENT_EXCEPTION_REVIEW_VALUES } from "./_lib/momo-payment-exception-model";

const OWNER_ROLES: readonly StaffRole[] = ["owner"];
const copy = messages.finance.bankTransactions.momoExceptions;

const reviewMomoPaymentExceptionSchema = z
  .object({
    paymentId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedTransactionId: z
      .string()
      .trim()
      .max(64)
      .regex(/^[1-9]\d*$/),
    status: z.enum(MOMO_PAYMENT_EXCEPTION_REVIEW_VALUES),
    resolutionReference: z.string().trim().max(160).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const reference = value.resolutionReference?.trim() ?? "";
    if (value.status === "refunded" && reference.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["resolutionReference"],
        message: copy.refundReferenceRequired,
      });
    }
    if (value.status === "reviewing" && reference.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["resolutionReference"],
        message: ERRORS_VI.validationFailed,
      });
    }
  });

type MomoReviewRpcError = {
  code?: string;
  message?: string;
};

type MomoReviewRpcClient = {
  rpc: (
    fn: "review_momo_payment_exception",
    args: {
      p_payment_id: number;
      p_expected_transaction_id: string;
      p_status: "reviewing" | "refunded";
      p_resolution_reference: string | null;
    },
  ) => PromiseLike<{ data: unknown; error: MomoReviewRpcError | null }>;
};

function mapMomoReviewError(error: MomoReviewRpcError): {
  error: string;
  errorCode: string;
} {
  const normalized = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || normalized.includes("forbidden_owner_only")) {
    return { error: copy.errors.forbidden, errorCode: "FORBIDDEN" };
  }
  if (
    error.code === "PGRST202" ||
    normalized.includes("review_momo_payment_exception")
  ) {
    return { error: copy.errors.notReady, errorCode: "RPC_NOT_READY" };
  }
  if (normalized.includes("invalid_momo_review_input")) {
    return {
      error: copy.errors.refundReferenceRequired,
      errorCode: "INVALID_REVIEW_INPUT",
    };
  }
  if (
    normalized.includes("momo_review_evidence_changed") ||
    normalized.includes("momo_review_payment_not_found") ||
    normalized.includes("momo_review_already_refunded")
  ) {
    return {
      error: copy.errors.evidenceChanged,
      errorCode: "EVIDENCE_CHANGED",
    };
  }

  return { error: copy.errors.actionError, errorCode: "REVIEW_FAILED" };
}

export async function reviewMomoPaymentException(
  input: z.infer<typeof reviewMomoPaymentExceptionSchema>,
): Promise<ActionResult> {
  const parsed = reviewMomoPaymentExceptionSchema.safeParse(input);
  if (!parsed.success) {
    const refundReferenceIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === "resolutionReference",
    );
    return {
      success: false,
      error: refundReferenceIssue
        ? copy.errors.refundReferenceRequired
        : ERRORS_VI.validationFailed,
      errorCode: "VALIDATION_FAILED",
    };
  }

  const ctx = await getAuthContextWithPermission(
    OWNER_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return {
      success: false,
      error: copy.errors.forbidden,
      errorCode: "FORBIDDEN",
    };
  }

  const resolutionReference =
    parsed.data.status === "refunded"
      ? (parsed.data.resolutionReference ?? null)
      : null;
  const { data, error } = await (ctx.supabase as MomoReviewRpcClient).rpc(
    "review_momo_payment_exception",
    {
      p_payment_id: parsed.data.paymentId,
      p_expected_transaction_id: parsed.data.expectedTransactionId,
      p_status: parsed.data.status,
      p_resolution_reference: resolutionReference,
    },
  );

  if (error) {
    console.error(
      "[finance:momo-exceptions] failed to review payment",
      error.code,
    );
    const mapped = mapMomoReviewError(error);
    return { success: false, ...mapped };
  }

  revalidateSurfacePath("/finance/bank-transactions");
  return { success: true, data };
}
