import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";

const snapshotSchema = z.object({
  state: z.enum(["open", "submitted", "expired", "closed"]),
  orderNumber: z.string().min(1).max(100),
  branchName: z.string().min(1).max(200),
  totalAmount: z.coerce.number().finite().nonnegative(),
  expiresAt: z.string().datetime({ offset: true }),
});

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

type UntypedServiceClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

export type InvoiceBuyerRequestSnapshot = z.infer<typeof snapshotSchema>;
export type SubmitInvoiceBuyerRequestResult =
  | { status: "submitted"; jobId: number | null }
  | { status: "expired" | "closed" | "not-found" | "failed"; jobId: null };

function service(): UntypedServiceClient {
  return createServiceClient() as unknown as UntypedServiceClient;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getInvoiceBuyerRequest(
  token: string,
): Promise<InvoiceBuyerRequestSnapshot | null> {
  const { data, error } = await service().rpc(
    "get_invoice_buyer_request_as_system",
    { p_token_hash: hashToken(token) },
  );
  if (error) {
    console.error("[hddt-buyer] request lookup failed", error.code);
    return null;
  }
  const parsed = snapshotSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function saveInvoiceBuyerRequest(
  token: string,
  invoicePayload: {
    buyerName: string;
    buyerTaxCode: string;
    buyerAddress: string;
    buyerEmail: string;
  },
): Promise<SubmitInvoiceBuyerRequestResult> {
  const { data, error } = await service().rpc(
    "submit_invoice_buyer_request_as_system",
    {
      p_token_hash: hashToken(token),
      p_invoice_payload: invoicePayload,
    },
  );
  if (!error) {
    const result = z
      .discriminatedUnion("status", [
        z.object({
          status: z.literal("submitted"),
          jobId: z.coerce.number().int().positive().optional(),
        }),
        z.object({
          status: z.enum(["expired", "closed"]),
        }),
      ])
      .safeParse(data);
    if (result.success) {
      if (result.data.status !== "submitted") {
        return { status: result.data.status, jobId: null };
      }
      return {
        status: "submitted",
        jobId: result.data.jobId ?? null,
      };
    }
    console.error("[hddt-buyer] invalid submit response");
    return { status: "failed", jobId: null };
  }

  const message = error.message ?? "";
  if (message.includes("invoice_buyer_request_expired")) {
    return { status: "expired", jobId: null };
  }
  if (message.includes("invoice_buyer_request_closed")) {
    return { status: "closed", jobId: null };
  }
  if (message.includes("invoice_buyer_request_not_found")) {
    return { status: "not-found", jobId: null };
  }

  console.error("[hddt-buyer] request submit failed", error.code);
  return { status: "failed", jobId: null };
}
