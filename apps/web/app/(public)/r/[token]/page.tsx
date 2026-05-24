import { notFound } from "next/navigation";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { isValidFeedbackToken } from "@comtammatu/shared/feedback";
import { FeedbackForm } from "./_components/feedback-form";

interface TokenPageProps {
  params: Promise<{ token: string }>;
}

// Returning 404 (via notFound()) for invalid/inactive tokens prevents Google
// from indexing thousands of dead /r/<token> URLs. App Router has no native
// 410 hook; 404 is the closest equivalent.
export default async function TokenPage({ params }: TokenPageProps) {
  const { token } = await params;

  if (!isValidFeedbackToken(token)) {
    notFound();
  }

  // Public route — service client check token validity without user auth.
  const supabase = createServiceClient();
  const { data: qrCode } = await supabase
    .from("feedback_qr_codes")
    .select("id, label, branch_id")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (!qrCode) {
    notFound();
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("name")
    .eq("id", qrCode.branch_id)
    .maybeSingle();

  const branchName = branch?.name ?? "Cơm Tấm Má Tư";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Góp ý cho chúng tôi</h1>
      </div>
      <FeedbackForm
        token={token}
        branchName={branchName}
        qrLabel={qrCode.label}
      />
      <p className="text-center text-xs text-muted-foreground">
        Phản ánh được gửi đến chủ quán
      </p>
    </div>
  );
}
