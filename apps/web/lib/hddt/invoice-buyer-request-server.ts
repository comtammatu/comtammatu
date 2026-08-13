import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { InvoiceBuyerOrderSummary } from "./invoice-buyer-types";

export type { InvoiceBuyerOrderSummary };

const orderLineSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.coerce.number().finite(),
  amount: z.coerce.number().finite(),
});

const orderSummarySchema = z.object({
  totalAmount: z.coerce.number().finite(),
  serviceCharge: z.coerce.number().finite(),
  discountAmount: z.coerce.number().finite(),
  items: z.array(orderLineSchema).max(200),
});

const snapshotSchema = z.object({
  state: z.enum(["open", "submitted", "expired", "closed", "not_required"]),
  orderNumber: z.string().min(1).max(100),
  branchName: z.string().min(1).max(200),
  expiresAt: z.string().datetime({ offset: true }),
});

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

type UntypedServiceClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

export type InvoiceBuyerRequestSnapshot = z.infer<typeof snapshotSchema> & {
  summary?: InvoiceBuyerOrderSummary;
};
export type SubmitInvoiceBuyerRequestResult =
  | { status: "submitted"; jobId: number | null }
  | {
      status: "expired" | "closed" | "not_required" | "not-found" | "failed";
      jobId: null;
    };

function service(): UntypedServiceClient {
  return createServiceClient() as unknown as UntypedServiceClient;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function formatOrderLineName(
  itemName: string,
  variantName: string | null,
): string {
  const name = itemName.trim() || "Món ăn";
  const variant = variantName?.trim();
  if (!variant || variant === name) return name;
  return `${name} - ${variant}`;
}

async function loadOrderSummary(
  tokenHash: string,
): Promise<InvoiceBuyerOrderSummary | undefined> {
  const supabase = createServiceClient();
  const { data: request, error: requestError } = await supabase
    .from("tax_invoice_buyer_requests")
    .select("order_id, tenant_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (requestError) {
    console.error("[hddt-buyer] order summary lookup failed", requestError.code);
    return undefined;
  }
  if (!request) return undefined;

  const [orderResult, itemsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("total_amount, service_charge, order_discount_amount")
      .eq("id", request.order_id)
      .eq("tenant_id", request.tenant_id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("item_name, variant_name, quantity, subtotal")
      .eq("order_id", request.order_id)
      .eq("tenant_id", request.tenant_id)
      .neq("status", "cancelled")
      .order("id")
      .limit(200),
  ]);

  if (orderResult.error) {
    console.error("[hddt-buyer] order totals lookup failed", orderResult.error.code);
    return undefined;
  }
  if (itemsResult.error) {
    console.error("[hddt-buyer] order lines lookup failed", itemsResult.error.code);
    return undefined;
  }
  if (!orderResult.data) return undefined;

  const parsed = orderSummarySchema.safeParse({
    totalAmount: orderResult.data.total_amount,
    serviceCharge: orderResult.data.service_charge,
    discountAmount: orderResult.data.order_discount_amount,
    items: (itemsResult.data ?? []).map((item) => ({
      name: formatOrderLineName(item.item_name, item.variant_name),
      quantity: item.quantity,
      amount: item.subtotal,
    })),
  });
  return parsed.success ? parsed.data : undefined;
}

export async function getInvoiceBuyerRequest(
  token: string,
): Promise<InvoiceBuyerRequestSnapshot | null> {
  const tokenHash = hashToken(token);
  const { data, error } = await service().rpc(
    "get_invoice_buyer_request_as_system",
    { p_token_hash: tokenHash },
  );
  if (error) {
    console.error("[hddt-buyer] request lookup failed", error.code);
    return null;
  }
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return null;
  if (parsed.data.state !== "open") return parsed.data;
  const summary = await loadOrderSummary(tokenHash);
  return summary ? { ...parsed.data, summary } : parsed.data;
}

export async function saveInvoiceBuyerRequest(
  token: string,
  invoicePayload: {
    buyerKind: "business" | "individual";
    buyerName: string;
    buyerTaxCode?: string;
    buyerAddress?: string;
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
          status: z.enum(["expired", "closed", "not_required"]),
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
