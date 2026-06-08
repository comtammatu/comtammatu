import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  PrintersClient,
  type Agent,
  type Category,
  type Printer,
} from "@/(protected)/admin/settings/printers/printers-client";

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

  const [branchRes, printersRes, agentRes, categoriesRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("printers")
      .select(
        "id, branch_id, role, name, lan_host, lan_port, paper_width_mm, code_page, is_active",
      )
      .eq("branch_id", branchId)
      .order("role"),
    supabase
      .from("printer_agent_status")
      .select("branch_id, agent_id, version, last_seen_at, is_online")
      .eq("branch_id", branchId),
    supabase
      .from("menu_categories")
      .select("id, name, type, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (printersRes.error) throw new Error("Không thể tải máy in");
  if (categoriesRes.error) throw new Error("Không thể tải danh mục");

  // HKD lean baseline: per-printer print-type / category routing is out of
  // scope, so every printer carries empty routing lists.
  const printers = (printersRes.data ?? []).map((printer) => ({
    ...printer,
    print_types: [] as string[],
    category_ids: [] as number[],
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/pos`}>
            <IconArrowLeft className="size-4" />
            {messages.settings.branch.posBack}
          </Link>
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {messages.settings.pages.printersTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {messages.settings.branch.printersDescription(branchRes.data.name)}
          </p>
        </div>
      </div>
      <PrintersClient
        branches={[branchRes.data]}
        printers={printers as Printer[]}
        agents={(agentRes.data ?? []) as Agent[]}
        categories={(categoriesRes.data ?? []) as Category[]}
      />
    </div>
  );
}
