import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { createMoMoGatewayFromEnv } from "@lib/momo";

const claimsSchema = z.array(
  z
    .object({
      paymentId: z.number().int().positive(),
      providerOrderId: z.string().min(1).max(100),
      amount: z.number().int().positive(),
    })
    .strict(),
);

type WorkerRpcClient = {
  rpc: <T>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string | null } | null }>;
};

export async function runMoMoReconciliationWorker(): Promise<{
  claimed: number;
  reconciled: number;
  pending: number;
  failed: number;
}> {
  const gateway = createMoMoGatewayFromEnv();
  if (!gateway) throw new Error("momo_not_configured");

  const service = createServiceClient();
  const rpc = service as unknown as WorkerRpcClient;
  const claimed = await rpc.rpc<unknown>("claim_pending_momo_reconciliations", {
    p_limit: 10,
  });
  if (claimed.error) throw new Error("momo_claim_failed");
  const parsed = claimsSchema.safeParse(claimed.data ?? []);
  if (!parsed.success) throw new Error("momo_claim_invalid");

  const summary = {
    claimed: parsed.data.length,
    reconciled: 0,
    pending: 0,
    failed: 0,
  };

  await Promise.all(
    parsed.data.map(async (claim) => {
      const queried = await gateway.queryPayment({
        requestId: randomUUID().replaceAll("-", ""),
        providerOrderId: claim.providerOrderId,
        amount: claim.amount,
      });
      if (!queried.ok) {
        summary.failed += 1;
        return;
      }

      const recorded = await rpc.rpc<{ status?: unknown }>(
        "record_momo_query_result",
        {
          p_payment_id: claim.paymentId,
          p_payload: queried.providerData,
        },
      );
      if (recorded.error) {
        summary.failed += 1;
        return;
      }
      if (
        recorded.data?.status === "completed" ||
        recorded.data?.status === "already_completed"
      ) {
        summary.reconciled += 1;
      } else {
        summary.pending += 1;
      }
    }),
  );

  return summary;
}
