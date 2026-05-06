import { createClient } from "@comtammatu/database/supabase/server";
import { loadAuthState } from "@/_lib/auth";
import { FeedbackInboxTable } from "./_components/feedback-inbox-table";
import type { FeedbackRow } from "./_components/feedback-inbox-table";

interface FeedbackPageProps {
  searchParams: Promise<{
    rating_max?: string;
    include_suspect?: string;
    page?: string;
  }>;
}

export default async function FeedbackPage({
  searchParams,
}: FeedbackPageProps) {
  const params = await searchParams;
  const { claims } = await loadAuthState();

  const supabase = await createClient();

  // Build query from VIEW (masked phone)
  let query = supabase
    .from("feedbacks_with_masked_phone")
    .select(
      "id, rating, comment, phone, branch_id, qr_code_id, created_at, is_suspect, ai_categories, ai_severity, ai_summary_vi, ai_sentiment_score, alert_priority",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.rating_max) {
    const max = Number(params.rating_max);
    if (!isNaN(max) && max >= 1 && max <= 5) {
      query = query.lte("rating", max);
    }
  }

  if (params.include_suspect !== "true") {
    query = query.eq("is_suspect", false);
  }

  const { data: rawFeedbacks } = await query;

  // Fetch QR code labels + branch names via separate queries (hand-coded types
  // do not declare Relationships, so Supabase nested join syntax is rejected
  // at compile time. Two-query approach keeps things type-safe).
  const qrIds = [
    ...new Set(
      (rawFeedbacks ?? [])
        .map((f) => f.qr_code_id)
        .filter((id): id is number => id !== null),
    ),
  ];
  const { data: qrCodes } =
    qrIds.length > 0
      ? await supabase
          .from("feedback_qr_codes")
          .select("id, label, branch_id")
          .in("id", qrIds)
      : { data: [] };

  const branchIds = [
    ...new Set((qrCodes ?? []).map((q) => q.branch_id).filter(Boolean)),
  ];
  const { data: branchRows } =
    branchIds.length > 0
      ? await supabase
          .from("branches")
          .select("id, name")
          .in("id", branchIds)
      : { data: [] };

  const branchNameById = new Map(
    (branchRows ?? []).map((b) => [b.id, b.name]),
  );
  const qrMap = new Map(
    (qrCodes ?? []).map((qr) => [
      qr.id,
      {
        label: qr.label,
        branch_name: branchNameById.get(qr.branch_id) ?? null,
      },
    ]),
  );

  const feedbacks: FeedbackRow[] = (rawFeedbacks ?? [])
    .filter(
      (f): f is typeof f & {
        id: number;
        rating: number;
        comment: string;
        created_at: string;
      } =>
        f.id !== null &&
        f.rating !== null &&
        f.comment !== null &&
        f.created_at !== null,
    )
    .map((f) => ({
      id: f.id,
      rating: f.rating,
      comment: f.comment,
      phone: f.phone,
      branch_name: f.qr_code_id
        ? (qrMap.get(f.qr_code_id)?.branch_name ?? null)
        : null,
      qr_label: f.qr_code_id ? (qrMap.get(f.qr_code_id)?.label ?? null) : null,
      created_at: f.created_at,
      is_suspect: f.is_suspect ?? false,
      ai_categories: f.ai_categories,
      ai_severity: f.ai_severity,
      ai_summary_vi: f.ai_summary_vi,
      ai_sentiment_score: f.ai_sentiment_score,
      alert_priority: f.alert_priority ?? 0,
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Phản ánh khách</h1>
      </div>
      <FeedbackInboxTable feedbacks={feedbacks} />
    </div>
  );
}
