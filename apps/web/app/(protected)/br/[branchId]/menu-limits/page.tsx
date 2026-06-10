import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { formatVNLongDate } from "@comtammatu/shared/time";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
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

  const today = formatVNLongDate(new Date());

  return (
    <AppPage width="default">
      <AppPageHeader
        title={messages.settings.branch.menuLimitsTitle}
        description={`${branch.name} · ${today}`}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/br/${branchId}/settings`}>
              <IconArrowLeft data-icon="inline-start" />
              {messages.settings.branch.branchSettingsBack}
            </Link>
          </Button>
        }
      />

      <AppSection tone="info" size="sm">
        <p>
          {messages.settings.branch.menuLimitsIntroBefore}{" "}
          <span className="font-medium text-foreground">
            {messages.settings.branch.menuLimitsDisabledAction}
          </span>{" "}
          {messages.settings.branch.menuLimitsIntroAfter}
        </p>
        <p className="mt-1">{messages.settings.branch.menuLimitsResetNote}</p>
        {!result.success ? (
          <p className="mt-2 text-destructive">
            {result.error ?? messages.settings.branch.menuLimitsLoadFailed}
          </p>
        ) : null}
      </AppSection>

      <MenuLimitsTable branchId={branchId} rows={rows} />
    </AppPage>
  );
}
