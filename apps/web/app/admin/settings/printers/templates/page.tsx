import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  ArrowLeft as IconArrowLeft,
  Activity as IconActivity,
} from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import { SettingsPageShell } from "../../settings-page-shell";
import { messages } from "@lib/messages";
import {
  PrintTemplatesClient,
  type BranchOption,
  type TemplateRow,
} from "./print-templates-client";

const TEMPLATE_ROLES = ["owner", "super_manager"] as const;

export default async function PrintTemplatesPage() {
  const { supabase, claims } = await loadAuthState();

  if (!(TEMPLATE_ROLES as readonly string[]).includes(claims.user_role)) {
    redirect("/admin/settings/printers");
  }

  const branchesQuery = supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const templatesQuery = supabase
    .from("print_template_versions")
    .select(
      "id, tenant_id, branch_id, kind, version, name, paper_width_mm, font_profile, content, is_active, updated_at, created_at",
    )
    .or(`tenant_id.is.null,tenant_id.eq.${claims.tenant_id}`)
    .order("kind")
    .order("branch_id", { nullsFirst: true })
    .order("version", { ascending: false });

  const [branchesRes, templatesRes] = await Promise.all([
    branchesQuery,
    templatesQuery,
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (templatesRes.error) throw new Error("Không thể tải mẫu in");

  return (
    <SettingsPageShell
      title={messages.settings.pages.printTemplatesTitle}
      description={messages.settings.pages.printTemplatesDescription}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings/printers">
              <IconArrowLeft className="size-4" />
              {messages.settings.printers.backPrinters}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings/printers/jobs">
              <IconActivity className="size-4" />
              {messages.settings.pages.printMonitor}
            </Link>
          </Button>
        </>
      }
    >
      <PrintTemplatesClient
        branches={(branchesRes.data ?? []) as BranchOption[]}
        templates={(templatesRes.data ?? []) as TemplateRow[]}
      />
    </SettingsPageShell>
  );
}

export const dynamic = "force-dynamic";
