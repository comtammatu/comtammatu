import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Item, ItemContent, ItemTitle } from "@comtammatu/ui/components/item";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import {
  canManageBranchFloorSettings,
  TENANT_LEVEL_ROLES,
} from "@comtammatu/shared/auth";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import {
  PrintJobsClient,
  type JobRow,
  type BranchOption,
} from "./print-jobs-client";
import { SettingsPageShell } from "../../settings-page-shell";
import { messages } from "@lib/messages";

type SearchParams = {
  branch?: string;
  status?: string;
  job_type?: string;
};

const STATUSES = [
  "pending",
  "processing",
  "printed",
  "failed",
  "expired",
  "cancelled",
] as const;
const JOB_TYPES = [
  "kitchen_ticket",
  "receipt",
  "provisional_bill",
  "reprint",
  "cancel_ticket",
] as const;

export default async function PrintJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/admin/settings");
  }

  const sp = await searchParams;
  const filterBranch =
    sp.branch && Number.isFinite(Number(sp.branch)) ? Number(sp.branch) : null;
  const filterStatus =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? sp.status
      : null;
  const filterJobType =
    sp.job_type && (JOB_TYPES as readonly string[]).includes(sp.job_type)
      ? sp.job_type
      : null;

  const isTenantLevel = (TENANT_LEVEL_ROLES as readonly string[]).includes(
    claims.user_role,
  );
  const scopedBranch = isTenantLevel ? null : claims.branch_id;
  const effectiveBranch = scopedBranch ?? filterBranch;

  let branchesQuery = supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (scopedBranch) {
    branchesQuery = branchesQuery.eq("id", scopedBranch);
  }

  let jobsQuery = supabase
    .from("print_jobs")
    .select(
      "id, branch_id, printer_id, job_type, status, attempts, retry_count, last_error, last_retried_at, created_at, printed_at, claimed_by_agent",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (effectiveBranch) jobsQuery = jobsQuery.eq("branch_id", effectiveBranch);
  if (filterStatus) jobsQuery = jobsQuery.eq("status", filterStatus);
  if (filterJobType) jobsQuery = jobsQuery.eq("job_type", filterJobType);

  const printersQuery = supabase.from("printers").select("id, role, name");

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sinceTodayVN = getVNDayUtcRange(getVNDateString()).startIso;

  let pendingQuery = supabase
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  let failedQuery = supabase
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since24h);
  let printedTodayQuery = supabase
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "printed")
    .gte("printed_at", sinceTodayVN);
  if (effectiveBranch) {
    pendingQuery = pendingQuery.eq("branch_id", effectiveBranch);
    failedQuery = failedQuery.eq("branch_id", effectiveBranch);
    printedTodayQuery = printedTodayQuery.eq("branch_id", effectiveBranch);
  }

  let agentsQuery = supabase
    .from("printer_agent_status")
    .select("branch_id, is_online");
  if (scopedBranch) agentsQuery = agentsQuery.eq("branch_id", scopedBranch);

  const [
    branchesRes,
    jobsRes,
    printersRes,
    pendingRes,
    failedRes,
    printedTodayRes,
    agentsRes,
  ] = await Promise.all([
    branchesQuery,
    jobsQuery,
    printersQuery,
    pendingQuery,
    failedQuery,
    printedTodayQuery,
    agentsQuery,
  ]);

  const printerMap = new Map<number, { role: string; name: string | null }>();
  for (const p of (printersRes.data ?? []) as Array<{
    id: number;
    role: string;
    name: string | null;
  }>) {
    printerMap.set(p.id, { role: p.role, name: p.name });
  }

  const jobs = ((jobsRes.data ?? []) as unknown as JobRow[]).map((j) => ({
    ...j,
    printer_role: printerMap.get(j.printer_id)?.role ?? null,
    printer_name: printerMap.get(j.printer_id)?.name ?? null,
  }));

  const agents = (agentsRes.data ?? []) as Array<{
    branch_id: number;
    is_online: boolean | null;
  }>;
  const onlineCount = agents.filter((a) => a.is_online).length;
  const agentTotal = agents.length;

  const branches = (branchesRes.data ?? []) as BranchOption[];

  return (
    <SettingsPageShell
      title={messages.settings.pages.printJobsTitle}
      description={messages.settings.pages.printJobsDescription}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/settings/printers">
            <IconArrowLeft className="size-4" />
            {messages.settings.printers.backPrinters}
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={messages.settings.printers.statPending}
          value={pendingRes.count ?? 0}
          tone="warning"
        />
        <StatCard
          label={messages.settings.printers.statFailed24h}
          value={failedRes.count ?? 0}
          tone={(failedRes.count ?? 0) > 0 ? "destructive" : "neutral"}
        />
        <StatCard
          label={messages.settings.printers.statPrintedToday}
          value={printedTodayRes.count ?? 0}
          tone="success"
        />
        <StatCard
          label={messages.settings.printers.statAgentOnline}
          value={`${onlineCount} / ${agentTotal}`}
          tone={
            onlineCount === agentTotal && agentTotal > 0 ? "success" : "warning"
          }
        />
      </div>

      <PrintJobsClient
        jobs={jobs}
        branches={branches}
        filterBranch={filterBranch}
        filterStatus={filterStatus}
        filterJobType={filterJobType}
        currentBranchLocked={scopedBranch != null}
      />
    </SettingsPageShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "neutral" | "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/40 text-success"
      : tone === "warning"
        ? "border-warning/40 text-warning"
        : tone === "destructive"
          ? "border-destructive/30 text-destructive"
          : "border-border/60 text-muted-foreground";
  return (
    <Item variant="outline" className={toneClass}>
      <ItemContent>
        <ItemTitle className="text-xs uppercase opacity-70">{label}</ItemTitle>
        <div className="text-2xl font-semibold">{value}</div>
      </ItemContent>
    </Item>
  );
}

export const dynamic = "force-dynamic";
