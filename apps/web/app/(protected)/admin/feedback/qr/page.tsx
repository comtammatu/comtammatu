import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { getAppUrl } from "@comtammatu/shared/feedback";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { QrManagementClient } from "./_components/qr-management-client";
import type {
  QrCodeRow,
  BranchOption,
} from "./_components/qr-management-client";

function getFeedbackPublicBaseUrl() {
  const feedbackHost = process.env.NEXT_PUBLIC_FEEDBACK_HOST?.trim();
  if (!feedbackHost) return getAppUrl();

  const normalizedHost = feedbackHost.replace(/^https?:\/\//i, "");
  return `https://${normalizedHost}`;
}

function buildFeedbackPublicUrl(token: string) {
  return new URL(`/r/${token}`, getFeedbackPublicBaseUrl()).toString();
}

export default async function QrPage() {
  const { claims } = await loadAuthState();

  // Owner-only page guard — proxy handles module-level ACL but this sub-page
  // is owner-only within the feedback module which allows broader roles.
  if (claims.user_role !== "owner") {
    redirect("/admin/feedback");
  }

  const supabase = await createClient();

  const [
    { data: rawQrCodes },
    { data: branches },
    { data: tenantSettings },
    { data: branchReviewSettings },
  ] = await Promise.all([
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
    supabase
      .from("feedback_settings")
      .select("google_review_url")
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("feedback_branch_review_settings")
      .select("branch_id, google_review_url")
      .eq("tenant_id", claims.tenant_id),
  ]);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const tenantReviewUrl = tenantSettings?.google_review_url?.trim() || null;
  const branchReviewUrlById = new Map(
    (branchReviewSettings ?? []).map((setting) => [
      setting.branch_id,
      setting.google_review_url?.trim() || null,
    ]),
  );

  const qrCodes: QrCodeRow[] = (rawQrCodes ?? []).map((qr) => {
    const branchReviewUrl = branchReviewUrlById.get(qr.branch_id) ?? null;
    const reviewUrlSource = branchReviewUrl
      ? "branch"
      : tenantReviewUrl
        ? "tenant"
        : "missing";

    return {
      id: qr.id,
      token: qr.token,
      public_url: buildFeedbackPublicUrl(qr.token),
      label: qr.label,
      branch_id: qr.branch_id,
      branch_name: branchNameById.get(qr.branch_id) ?? "",
      review_url_source: reviewUrlSource,
      is_active: qr.is_active,
      created_at: qr.created_at,
    };
  });

  const branchOptions: BranchOption[] = (branches ?? []).map((b) => ({
    id: b.id,
    name: b.name,
  }));

  return (
    <AppPage>
      <AppPageHeader
        title="Quản lý mã QR"
        description="Tạo và quản lý mã QR cho từng chi nhánh để thu thập phản hồi khách hàng."
      />
      <QrManagementClient qrCodes={qrCodes} branches={branchOptions} />
    </AppPage>
  );
}
