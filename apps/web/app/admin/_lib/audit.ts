"use server";

/**
 * Insert an audit log entry. Fire-and-forget — does not throw on failure.
 * Used by finance/payroll actions for compliance tracking.
 */
export async function logAudit(
  supabase: {
    from: (table: string) => {
      insert: (data: Record<string, unknown>) => {
        then: (fn: () => void) => void;
      };
    };
  },
  params: {
    tenantId: number;
    userId: string;
    action: string;
    entityType: string;
    entityId: number | null;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
  },
): Promise<void> {
  await supabase
    .from("audit_logs")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
    })
    .then(() => {
      /* fire-and-forget */
    });
}
