"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import {
  loadGrnDetailResult,
} from "@lib/inventory/grn-detail-data";
import type { GrnDetailData } from "@lib/inventory/grn-detail-model";
import { messages } from "@lib/messages";

export type LoadGrnDocumentDialogResult = ActionResult & {
  data?: GrnDetailData;
};

/** Client-callable detail loader for list-first GRN AppDialog (no list RSC remount). */
export async function loadGrnDocumentDialog(
  grnKey: string,
): Promise<LoadGrnDocumentDialogResult> {
  const result = await loadGrnDetailResult(grnKey);
  if (!result.data) {
    return {
      success: false,
      error: result.error ?? messages.inventory.grn.notFound,
      errorCode: result.notFound ? "not_found" : "load_failed",
    };
  }
  return { success: true, data: result.data };
}
