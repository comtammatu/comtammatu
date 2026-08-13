"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import {
  fetchProductionRunById,
  type ProductionRunRow,
} from "./production-run-actions";

export type LoadProductionDocumentDialogResult = ActionResult & {
  data?: ProductionRunRow;
};

/** Client-callable detail loader for list-first production AppDialog. */
export async function loadProductionDocumentDialog(
  runId: string,
): Promise<LoadProductionDocumentDialogResult> {
  const parsed = Number.parseInt(runId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      success: false,
      error: messages.inventory.operatorFlow.productionRunLoadFailed,
      errorCode: "not_found",
    };
  }
  const result = await fetchProductionRunById(parsed);
  if (!result.success || !result.data) {
    return {
      success: false,
      error:
        result.error ??
        messages.inventory.operatorFlow.productionRunLoadFailed,
      errorCode: "not_found",
    };
  }
  return { success: true, data: result.data };
}
