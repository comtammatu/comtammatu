import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import {
  DEFAULT_TEMPLATE_CONTENT,
  PRINT_KINDS,
  type PrintKind,
  type TemplateBlock,
} from "@comtammatu/print-render/templates";
import {
  TemplatesClient,
  type BranchOption,
  type KindTemplate,
} from "./templates-client";
import { SettingsPageFrame } from "../../settings-page-frame";
import { messages } from "@lib/messages";

const TENANT_TEMPLATE_ROLES = ["owner"] as const;

type TemplateRow = {
  id: number;
  tenant_id: number | null;
  kind: string;
  version: number;
  name: string;
  paper_width_mm: number;
  content: { blocks?: TemplateBlock[] } | null;
};

export default async function PrintTemplatesPage() {
  const { supabase, claims } = await loadAuthState();

  if (
    !(TENANT_TEMPLATE_ROLES as readonly string[]).includes(claims.user_role)
  ) {
    redirect("/admin/settings/printers");
  }

  const [templatesRes, branchesRes] = await Promise.all([
    supabase
      .from("print_template_versions")
      .select("id, tenant_id, kind, version, name, paper_width_mm, content")
      .eq("is_active", true)
      .is("branch_id", null),
    supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (templatesRes.error) throw new Error("Không thể tải mẫu phiếu in");
  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");

  const rows = (templatesRes.data ?? []) as TemplateRow[];

  const templates: KindTemplate[] = PRINT_KINDS.map((kind: PrintKind) => {
    const tenantRow = rows.find(
      (r) => r.kind === kind && r.tenant_id !== null,
    );
    const row = tenantRow ?? rows.find((r) => r.kind === kind) ?? null;
    const blocks =
      row?.content?.blocks && row.content.blocks.length > 0
        ? row.content.blocks
        : DEFAULT_TEMPLATE_CONTENT[kind].blocks;
    return {
      kind,
      blocks,
      paperWidth: row?.paper_width_mm === 58 ? 58 : 80,
      source: tenantRow ? "custom" : "default",
      versionLabel: tenantRow ? `v${tenantRow.version} — ${tenantRow.name}` : null,
    };
  });

  return (
    <SettingsPageFrame
      title={messages.settings.pages.printTemplatesTitle}
      description={messages.settings.pages.printTemplatesDescription}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href="/admin/settings/printers">
            <IconArrowLeft className="size-3.5" />
            {messages.settings.pages.printersTitle}
          </Link>
        </Button>
      }
    >
      <TemplatesClient
        templates={templates}
        branches={(branchesRes.data ?? []) as BranchOption[]}
      />
    </SettingsPageFrame>
  );
}
