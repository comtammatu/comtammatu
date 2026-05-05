import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { fetchBranchMenuDailyLimits } from "./actions";
import { MenuLimitsTable } from "./menu-limits-table";

export const dynamic = "force-dynamic";

export default async function BranchMenuLimitsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const result = await fetchBranchMenuDailyLimits(branchId);
  const rows = result.success && result.data ? result.data : [];

  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/settings`}>
            <IconArrowLeft className="size-4" />
            {messages.settings.branch.branchSettingsBack}
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {messages.settings.branch.menuLimitsTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {branch.name} · {today}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <p>
          {messages.settings.branch.menuLimitsIntroBefore}{" "}
          <span className="font-medium text-foreground">
            {messages.settings.branch.menuLimitsDisabledAction}
          </span>{" "}
          {messages.settings.branch.menuLimitsIntroAfter}
        </p>
        <p className="mt-1">
          {messages.settings.branch.menuLimitsResetNote}
        </p>
        {!result.success ? (
          <p className="mt-2 text-destructive">
            {result.error ?? messages.settings.branch.menuLimitsLoadFailed}
          </p>
        ) : null}
      </div>

      <MenuLimitsTable branchId={branchId} rows={rows} />
    </div>
  );
}
