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

  const [
    branchRes,
    printersRes,
    agentRes,
    printTypesRes,
    categoryRoutesRes,
    categoriesRes,
  ] = await Promise.all([
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
      .from("printer_print_types")
      .select("branch_id, printer_id, print_type")
      .eq("branch_id", branchId),
    supabase
      .from("printer_menu_categories")
      .select("branch_id, printer_id, category_id")
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
  if (printTypesRes.error) throw new Error("Không thể tải loại phiếu in");
  if (categoryRoutesRes.error)
    throw new Error("Không thể tải routing danh mục");
  if (categoriesRes.error) throw new Error("Không thể tải danh mục");

  const printTypesByPrinter = new Map<number, string[]>();
  for (const row of printTypesRes.data ?? []) {
    const list = printTypesByPrinter.get(row.printer_id) ?? [];
    list.push(row.print_type);
    printTypesByPrinter.set(row.printer_id, list);
  }

  const categoryIdsByPrinter = new Map<number, number[]>();
  for (const row of categoryRoutesRes.data ?? []) {
    const list = categoryIdsByPrinter.get(row.printer_id) ?? [];
    list.push(row.category_id);
    categoryIdsByPrinter.set(row.printer_id, list);
  }

  const printers = (printersRes.data ?? []).map((printer) => ({
    ...printer,
    print_types: printTypesByPrinter.get(printer.id) ?? [],
    category_ids: categoryIdsByPrinter.get(printer.id) ?? [],
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
