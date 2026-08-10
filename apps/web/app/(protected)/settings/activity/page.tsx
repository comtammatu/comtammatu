import Link from "next/link";
import {
  History as IconHistory,
  ShieldCheck as IconShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { formatAuditEntityTypeLabel } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  AppEmptyState,
  AppSection,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { fetchTenantAuditLogs } from "@/_lib/audit";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "../settings-page-frame";
import {
  SystemActivityFilters,
  type SystemActivityActorOption,
  type SystemActivityEntityOption,
} from "./system-activity-filters";
import { SystemActivityTable } from "./system-activity-table";

interface Props {
  searchParams: Promise<{
    entity_type?: string;
    actor?: string;
    since?: string;
  }>;
}

const ENTITY_FILTER_OPTIONS: SystemActivityEntityOption[] = [
  { id: "goods_received_note", label: formatAuditEntityTypeLabel("goods_received_note") },
  { id: "stock_transfer", label: formatAuditEntityTypeLabel("stock_transfer") },
  { id: "stock_request", label: formatAuditEntityTypeLabel("stock_request") },
  { id: "stock_issue", label: formatAuditEntityTypeLabel("stock_issue") },
  { id: "stocktake_session", label: formatAuditEntityTypeLabel("stocktake_session") },
  { id: "orders", label: formatAuditEntityTypeLabel("orders") },
  { id: "expense", label: formatAuditEntityTypeLabel("expense") },
  { id: "tax_invoice", label: formatAuditEntityTypeLabel("tax_invoice") },
];

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
  const entityType =
    params.entity_type &&
    ENTITY_FILTER_OPTIONS.some((option) => option.id === params.entity_type)
      ? params.entity_type
      : null;
  const actor = params.actor?.trim() || null;
  const since = params.since?.trim() || null;
  const sinceIso = since ? getVNDayUtcRange(since).startIso : null;

  const rows = await fetchTenantAuditLogs({
    sinceIso,
    entityType,
    actorUserId: actor,
    limit: 200,
  });

  const actorOptionById = new Map<string, SystemActivityActorOption>();
  for (const row of rows) {
    if (!row.userId || actorOptionById.has(row.userId)) continue;
    actorOptionById.set(row.userId, {
      id: row.userId,
      label: row.actorName ?? UNKNOWN_LABEL_VI,
    });
  }

  const copy = messages.settings.activity;
  const pages = messages.settings.pages;
  const hasFilters = Boolean(entityType || actor || since);

  return (
    <SettingsPageFrame
      title={copy.title}
      description={copy.description}
      width="wide"
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
      <AppSection
        title={copy.recentItems(rows.length)}
        description={pages.systemActivityDescription}
      >
        <SystemActivityFilters
          value={{ entityType, actor, since }}
          actorOptions={[...actorOptionById.values()].sort((a, b) =>
            a.label.localeCompare(b.label, "vi"),
          )}
          entityOptions={ENTITY_FILTER_OPTIONS}
        />

        {rows.length === 0 ? (
          <AppEmptyState
            mode={hasFilters ? "no-results" : "no-data"}
            title={hasFilters ? copy.emptyFiltered : copy.empty}
            description={hasFilters ? copy.emptyFilteredHint : undefined}
            icon={<IconHistory />}
          >
            {hasFilters ? null : (
              <Button variant="outline" render={<Link href="/settings" />}>
                {pages.settingsHomeLink}
              </Button>
            )}
          </AppEmptyState>
        ) : (
          <SystemActivityTable rows={rows} />
        )}
      </AppSection>
    </SettingsPageFrame>
  );
}
