"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchTenantAuditLogDetail,
  type TenantAuditLogDetail,
} from "@/_lib/audit";
import { messages } from "@lib/messages";

const detailSchema = z.object({
  id: z.number().int().positive(),
});

/**
 * Owner-only evidence fetch for the system activity sheet.
 * List queries stay narrow; diffs load only for the selected row.
 */
export async function getSystemActivityDetail(
  input: z.input<typeof detailSchema>,
): Promise<ActionResult<TenantAuditLogDetail>> {
  const parsed = detailSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: messages.settings.activity.detailFailed };
  }

  const { claims } = await loadAuthState();
  if (claims.user_role !== "owner") {
    return { success: false, error: messages.settings.activity.detailFailed };
  }

  const detail = await fetchTenantAuditLogDetail(parsed.data.id);
  if (!detail) {
    return { success: false, error: messages.settings.activity.detailFailed };
  }

  return { success: true, data: detail };
}
