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

const submitSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{48}$/),
  taxCode: z
    .string()
    .trim()
    .regex(/^\d{10}(-\d{3})?$/),
  email: z.string().trim().email().max(254),
});

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

  const submission = await saveInvoiceBuyerRequest(parsed.data.token, {
    buyerName: business.name,
    buyerTaxCode: parsed.data.taxCode,
    buyerAddress: business.address,
    buyerEmail: parsed.data.email,
  });

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
  return {
    ok: false,
    message: invoiceBuyer.saveFailed,
  };
}
