import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { QrManagementClient } from "./_components/qr-management-client";
import type {
  QrCodeRow,
  BranchOption,
} from "./_components/qr-management-client";

export default async function QrPage() {
  const { claims } = await loadAuthState();

  // Owner-only page guard — proxy handles module-level ACL but this sub-page
  // is owner-only within the feedback module which allows broader roles.
  if (claims.user_role !== "owner") {
    redirect("/admin/feedback");
  }

  const supabase = await createClient();

  const [{ data: rawQrCodes }, { data: branches }] = await Promise.all([
    supabase
      .from("feedback_qr_codes")
      .select("id, token, label, branch_id, is_active, created_at")
      .eq("tenant_id", claims.tenant_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  const qrCodes: QrCodeRow[] = (rawQrCodes ?? []).map((qr) => ({
    id: qr.id,
    token: qr.token,
    label: qr.label,
    branch_id: qr.branch_id,
    branch_name: branchNameById.get(qr.branch_id) ?? "",
    is_active: qr.is_active,
    created_at: qr.created_at,
  }));

  const branchOptions: BranchOption[] = (branches ?? []).map((b) => ({
    id: b.id,
    name: b.name,
  }));

  return (
    <AppPage>
      <AppPageHeader
        title="Quản lý QR codes"
        description="Tạo và quản lý mã QR cho từng chi nhánh để thu thập phản hồi khách hàng."
      />
      <QrManagementClient qrCodes={qrCodes} branches={branchOptions} />
    </AppPage>
  );
}
