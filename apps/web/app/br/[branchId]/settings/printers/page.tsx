import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import {
  PrintersClient,
  type Agent,
  type Printer,
} from "@/admin/settings/printers/printers-client";

export default async function BranchPrintersPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase } = await loadAuthState();

  const [branchRes, printersRes, agentRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("printers")
      .select(
        "id, branch_id, role, name, connection_type, lan_host, lan_port, usb_vendor_id, usb_product_id, paper_width_mm, code_page, is_active",
      )
      .eq("branch_id", branchId)
      .order("role"),
    supabase
      .from("printer_agent_status")
      .select("branch_id, agent_id, version, last_seen_at, is_online")
      .eq("branch_id", branchId),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (printersRes.error) throw new Error("Không thể tải máy in");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/pos`}>
            <IconArrowLeft className="size-4" />
            Về POS
          </Link>
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Máy in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cấu hình 3 máy in của {branchRes.data.name}: hoá đơn, bếp 1, bếp 2
          </p>
        </div>
      </div>
      <PrintersClient
        branches={[branchRes.data]}
        printers={(printersRes.data ?? []) as Printer[]}
        agents={(agentRes.data ?? []) as Agent[]}
      />
    </div>
  );
}
