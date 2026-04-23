import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import {
  TerminalsClient,
  type BranchOption,
  type TerminalRow,
} from "@/admin/settings/pos/terminals-client";

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
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/settings`}>
            <IconArrowLeft className="size-4" />
            Thiết lập
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">POS</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {branchRes.data.name}
          </p>
        </div>
      </div>

      <TerminalsClient
        branches={[branchRes.data] as BranchOption[]}
        terminals={(terminalsRes.data ?? []) as TerminalRow[]}
      />
    </div>
  );
}
