"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { rateLimit } from "@comtammatu/security";
import { fetchBusinessTaxCode } from "@lib/hddt/business-tax-lookup-server";
import { saveInvoiceBuyerRequest } from "@lib/hddt/invoice-buyer-request-server";
import { invoiceBuyer } from "@lib/messages/invoice-buyer";
import { runTaxInvoiceIssueWorker } from "@lib/tax-invoice-issue-worker";

const mstSchema = z
  .string()
  .trim()
  .regex(/^\d{10}(-\d{3})?$/);

const submitSchema = z.discriminatedUnion("buyerKind", [
  z.object({
    buyerKind: z.literal("business"),
    token: z.string().regex(/^[a-f0-9]{48}$/),
    taxCode: mstSchema,
    email: z.string().trim().email().max(254),
  }),
  z.object({
    buyerKind: z.literal("individual"),
    token: z.string().regex(/^[a-f0-9]{48}$/),
    buyerName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(254),
    taxCode: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || mstSchema.safeParse(value).success)
      .optional(),
    buyerAddress: z.string().trim().max(500).optional(),
  }),
]);

export type SubmitInvoiceBuyerDetailsResult =
  { ok: true } | { ok: false; message: string; terminal?: true };

export async function submitInvoiceBuyerDetails(
  input: unknown,
): Promise<SubmitInvoiceBuyerDetailsResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: invoiceBuyer.invalid,
    };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const tokenKey = createHash("sha256")
    .update(parsed.data.token)
    .digest("hex")
    .slice(0, 16);
  try {
    const { success: allowed } = await rateLimit.limit(
      `invoice-buyer:${ip}:${tokenKey}`,
    );
    if (!allowed) {
      return { ok: false, message: invoiceBuyer.tooManyRequests };
    }
  } catch {
    return { ok: false, message: invoiceBuyer.saveFailed };
  }

  let invoicePayload: {
    buyerKind: "business" | "individual";
    buyerName: string;
    buyerTaxCode?: string;
    buyerAddress?: string;
    buyerEmail: string;
  };

  if (parsed.data.buyerKind === "business") {
    let business;
    try {
      business = await fetchBusinessTaxCode(parsed.data.taxCode);
    } catch {
      return {
        ok: false,
        message: invoiceBuyer.serverLookupUnavailable,
      };
    }
    if (!business) {
      return {
        ok: false,
        message: invoiceBuyer.serverLookupNotFound,
      };
    }
    invoicePayload = {
      buyerKind: "business",
      buyerName: business.name,
      buyerTaxCode: parsed.data.taxCode,
      buyerAddress: business.address,
      buyerEmail: parsed.data.email,
    };
  } else {
    const taxCode = parsed.data.taxCode?.trim() || undefined;
    const buyerAddress = parsed.data.buyerAddress?.trim() || undefined;
    invoicePayload = {
      buyerKind: "individual",
      buyerName: parsed.data.buyerName,
      buyerEmail: parsed.data.email,
      ...(taxCode ? { buyerTaxCode: taxCode } : {}),
      ...(buyerAddress ? { buyerAddress } : {}),
    };
  }

  const submission = await saveInvoiceBuyerRequest(
    parsed.data.token,
    invoicePayload,
  );

  if (submission.status === "submitted") {
    const jobId = submission.jobId;
    if (jobId !== null) {
      after(async () => {
        try {
          await runTaxInvoiceIssueWorker(jobId);
        } catch {
          console.error("[hddt-buyer] targeted invoice worker failed", {
            jobId,
          });
        }
      });
    }
    return { ok: true };
  }
  if (submission.status === "expired") {
    return { ok: false, message: invoiceBuyer.expired, terminal: true };
  }
  if (submission.status === "closed") {
    return { ok: false, message: invoiceBuyer.closed, terminal: true };
  }
  if (submission.status === "not_required") {
    return {
      ok: false,
      message: invoiceBuyer.notRequiredDescription,
      terminal: true,
    };
  }
  return {
    ok: false,
    message: invoiceBuyer.saveFailed,
  };
}
