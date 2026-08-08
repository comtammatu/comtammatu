import "server-only";

import { createServiceClient } from "@comtammatu/database/supabase/service";

export type ChecklistPhotoMeta = {
  allowsPhoto: boolean;
  hasPhoto: boolean;
};

/** Load photo flags for checkout-review checklist rows (service path; page already gated). */
export async function loadCheckoutChecklistPhotoMeta(
  tenantId: number,
  attendanceIds: number[],
): Promise<Map<number, ChecklistPhotoMeta>> {
  const metaByItemId = new Map<number, ChecklistPhotoMeta>();
  if (attendanceIds.length === 0) return metaByItemId;

  const service = createServiceClient();
  const { data, error } = await service
    .from("attendance_checklist_items")
    .select("id, allows_photo, photo_path")
    .eq("tenant_id", tenantId)
    .in("attendance_record_id", attendanceIds);

  if (error) {
    console.error("[checkout-approvals] checklist photo meta failed", {
      code: error.code,
    });
    return metaByItemId;
  }

  for (const row of data ?? []) {
    const allowsPhoto = row.allows_photo === true;
    metaByItemId.set(row.id, {
      allowsPhoto,
      hasPhoto:
        allowsPhoto &&
        typeof row.photo_path === "string" &&
        row.photo_path.length > 0,
    });
  }

  return metaByItemId;
}
