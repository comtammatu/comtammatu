import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import {
  TerminalsClient,
  type BranchOption,
  type TerminalRow,
} from "@/(protected)/admin/settings/pos/terminals-client";

export default async function BranchPosSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, terminalsRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("pos_terminals")
      .select("id, name, branch_id, device_id, is_active")
      .eq("branch_id", branchId)
      .order("name"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (terminalsRes.error) throw new Error("Không thể tải máy POS");

  return (
    <AppPage width="default">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/settings`}>
            <IconArrowLeft className="size-4" />
            Thiết lập
          </Link>
        </Button>
        <AppPageHeader
          className="min-w-0 flex-1"
          title="POS"
          description={branchRes.data.name}
        />
      </div>

      <TerminalsClient
        branches={[branchRes.data] as BranchOption[]}
        terminals={(terminalsRes.data ?? []) as TerminalRow[]}
      />
    </AppPage>
  );
}
