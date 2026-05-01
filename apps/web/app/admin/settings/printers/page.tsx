import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Activity as IconActivity } from "lucide-react";
import {
  canManageBranchFloorSettings,
  TENANT_LEVEL_ROLES,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  PrintersClient,
  type Agent,
  type Category,
  type Printer,
} from "./printers-client";

export default async function PrintersPage() {
  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/admin/settings");
  }

  let branchesQuery = supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  let printersQuery = supabase
    .from("printers")
    .select(
      "id, branch_id, role, name, connection_type, lan_host, lan_port, usb_vendor_id, usb_product_id, paper_width_mm, code_page, is_active",
    )
    .order("branch_id")
    .order("role");

  let agentsQuery = supabase
    .from("printer_agent_status")
    .select("branch_id, agent_id, version, last_seen_at, is_online");

  let printTypesQuery = supabase
    .from("printer_print_types")
    .select("branch_id, printer_id, print_type");

  let categoryRoutesQuery = supabase
    .from("printer_menu_categories")
    .select("branch_id, printer_id, category_id");

  const categoriesQuery = supabase
    .from("menu_categories")
    .select("id, name, type, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  const isTenantLevel = (TENANT_LEVEL_ROLES as readonly string[]).includes(
    claims.user_role,
  );
  const scopedBranch = isTenantLevel ? null : claims.branch_id;
  if (scopedBranch) {
    branchesQuery = branchesQuery.eq("id", scopedBranch);
    printersQuery = printersQuery.eq("branch_id", scopedBranch);
    agentsQuery = agentsQuery.eq("branch_id", scopedBranch);
    printTypesQuery = printTypesQuery.eq("branch_id", scopedBranch);
    categoryRoutesQuery = categoryRoutesQuery.eq("branch_id", scopedBranch);
  }

  const [
    branchesRes,
    printersRes,
    agentsRes,
    printTypesRes,
    categoryRoutesRes,
    categoriesRes,
  ] = await Promise.all([
    branchesQuery,
    printersQuery,
    agentsQuery,
    printTypesQuery,
    categoryRoutesQuery,
    categoriesQuery,
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Máy in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cấu hình máy in theo từng chi nhánh: loại phiếu và danh mục món in
            trên từng máy.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href="/admin/settings/printers/jobs">
            <IconActivity className="size-3.5" />
            Giám sát in
          </Link>
        </Button>
      </div>
      <PrintersClient
        branches={branchesRes.data ?? []}
        printers={printers as Printer[]}
        agents={(agentsRes.data ?? []) as Agent[]}
        categories={(categoriesRes.data ?? []) as Category[]}
      />
    </div>
  );
}
