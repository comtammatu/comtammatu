import type { SupabaseClient } from "@supabase/supabase-js";
import { messages } from "@lib/messages";

type CountDutyItem = {
  id: number;
  title: string;
  taskKind: string;
  done: boolean;
};

const COUNT_DUTY_TITLES = new Set(
  [
    messages.employee.home.countTitle,
    messages.employee.count.catalogTaskTitle,
    messages.employee.count.clockInTaskTitle,
  ].map((title) => title.trim().toLocaleLowerCase("vi")),
);

export function isShiftCountDutyTitle(title: string): boolean {
  return COUNT_DUTY_TITLES.has(title.trim().toLocaleLowerCase("vi"));
}

export function isShiftCountDutyItem(item: {
  taskKind: string;
  title: string;
}): boolean {
  return item.taskKind === "inventory_count" || isShiftCountDutyTitle(item.title);
}

export async function markCompletedCountDutyChecklistItems({
  service,
  tenantId,
  attendanceId,
  items,
}: {
  service: SupabaseClient;
  tenantId: number;
  attendanceId: number;
  items: CountDutyItem[];
}): Promise<void> {
  const ids = items
    .filter((item) => isShiftCountDutyItem(item) && item.done && item.id > 0)
    .map((item) => item.id);
  if (ids.length === 0) return;

  await service
    .from("attendance_checklist_items")
    .update({
      is_done: true,
      completed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("attendance_record_id", attendanceId)
    .in("id", ids)
    .eq("is_done", false);
}
