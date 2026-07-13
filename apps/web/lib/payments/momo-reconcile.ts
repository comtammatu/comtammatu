import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { getMomoConfig } from "./momo";
import { queryMomoTransaction } from "./momo-query";
import {
  runClaimedMomoReconciliationBatch,
  runSelfOrderMomoReconciliation,
  type MomoReconciliationRpcClient,
  type MomoReconciliationOutcome,
  type MomoReconciliationSummary,
} from "./momo-reconcile-core";

export async function executeMomoReconciliationBatch(
  supabase: SupabaseClient<Database>,
): Promise<MomoReconciliationSummary> {
  let config: ReturnType<typeof getMomoConfig> | undefined;
  return runClaimedMomoReconciliationBatch({
    rpc: supabase as unknown as MomoReconciliationRpcClient,
    claimId: randomUUID(),
    makeQueryRequestId: randomUUID,
    query: (input) => queryMomoTransaction(input, (config ??= getMomoConfig())),
  });
}

export async function executeSelfOrderMomoReconciliation(
  supabase: SupabaseClient<Database>,
  input: { token: string; clientOpId: string },
): Promise<{
  claimStatus: string;
  outcome: MomoReconciliationOutcome | null;
}> {
  let config: ReturnType<typeof getMomoConfig> | undefined;
  return runSelfOrderMomoReconciliation({
    rpc: supabase as unknown as MomoReconciliationRpcClient,
    token: input.token,
    clientOpId: input.clientOpId,
    claimId: randomUUID(),
    makeQueryRequestId: randomUUID,
    query: (queryInput) =>
      queryMomoTransaction(queryInput, (config ??= getMomoConfig())),
  });
}
