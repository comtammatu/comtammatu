import Link from "next/link";
import {
  ShieldCheck as IconShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { formatAuditEntityTypeLabel } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { fetchTenantAuditLogs } from "@/_lib/audit";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "../settings-page-frame";
import { SystemActivityClient } from "./system-activity-client";
import type { SystemActivityEntityOption } from "./system-activity-filters";

interface Props {
  searchParams: Promise<{
    entity_type?: string;
    entity_id?: string;
    actor?: string;
    since?: string;
    q?: string;
  }>;
}

const ENTITY_FILTER_OPTIONS: SystemActivityEntityOption[] = [
  { id: "goods_received_note", label: formatAuditEntityTypeLabel("goods_received_note") },
  { id: "stock_transfer", label: formatAuditEntityTypeLabel("stock_transfer") },
  { id: "stock_request", label: formatAuditEntityTypeLabel("stock_request") },
  { id: "stock_issue", label: formatAuditEntityTypeLabel("stock_issue") },
  { id: "stocktake_session", label: formatAuditEntityTypeLabel("stocktake_session") },
  { id: "purchase_order", label: formatAuditEntityTypeLabel("purchase_order") },
  { id: "orders", label: formatAuditEntityTypeLabel("orders") },
  { id: "expense", label: formatAuditEntityTypeLabel("expense") },
  { id: "tax_invoice", label: formatAuditEntityTypeLabel("tax_invoice") },
];

function parseEntityTypeParam(raw: string | undefined): string | null {
  const trimmed = raw?.trim() || null;
  if (!trimmed) return null;
  if (ENTITY_FILTER_OPTIONS.some((option) => option.id === trimmed)) {
    return trimmed;
  }
  // Allow deep-links (e.g. notification → activity) for known snake_case types.
  return /^[a-z][a-z0-9_]*$/i.test(trimmed) ? trimmed : null;
}

/**
 * Tenant-wide operational audit viewer (owner settings).
 * RLS: audit_logs_select requires settings:tenant or staff:assign_permission.
 */
export default async function SystemActivityPage({ searchParams }: Props) {
  const { claims } = await loadAuthState();
  if (claims.user_role !== "owner") {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const params = await searchParams;
  const entityType = parseEntityTypeParam(params.entity_type);
  const entityIdRaw = params.entity_id?.trim() || null;
  const entityId =
    entityIdRaw && /^\d+$/.test(entityIdRaw) ? Number(entityIdRaw) : null;
  const actor = params.actor?.trim() || null;
  const since = params.since?.trim() || null;
  const q = params.q?.trim() || null;
  const sinceIso = since ? getVNDayUtcRange(since).startIso : null;

  const rows = await fetchTenantAuditLogs({
    sinceIso,
    entityType,
    entityId,
    actorUserId: actor,
    limit: 200,
  });

  const actorOptionById = new Map<
    string,
    { id: string; label: string }
  >();
  for (const row of rows) {
    if (!row.userId || actorOptionById.has(row.userId)) continue;
    actorOptionById.set(row.userId, {
      id: row.userId,
      label: row.actorName ?? UNKNOWN_LABEL_VI,
    });
  }

  const copy = messages.settings.activity;

  const entityOptions =
    entityType && !ENTITY_FILTER_OPTIONS.some((o) => o.id === entityType)
      ? [
          ...ENTITY_FILTER_OPTIONS,
          {
            id: entityType,
            label: formatAuditEntityTypeLabel(entityType),
          },
        ]
      : ENTITY_FILTER_OPTIONS;

  return (
    <SettingsPageFrame
      title={copy.title}
      description={copy.description}
      width="xwide"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/settings/tracking" />}
          >
            {copy.trackingHubLink}
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/hr/staff/audit" />}
          >
            <IconShieldCheck data-icon="inline-start" />
            {copy.permissionAuditLink}
          </Button>
        </div>
      }
    >
      <SystemActivityClient
        rows={rows}
        filterValue={{
          entityType,
          entityId: entityId != null ? String(entityId) : null,
          actor,
          since,
          q,
        }}
        actorOptions={[...actorOptionById.values()].sort((a, b) =>
          a.label.localeCompare(b.label, "vi"),
        )}
        entityOptions={entityOptions}
      />
    </SettingsPageFrame>
  );
}
