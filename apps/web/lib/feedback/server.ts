import { createServiceClient } from "@comtammatu/database/supabase/service";
import { feedbackTokenSchema } from "./contracts";

export type FeedbackQrPublicContext = {
  token: string;
  label: string;
  branchName: string;
  branchId: number;
  branchPhone: string | null;
  googleReviewUrl: string | null;
};

export type SubmitFeedbackResult =
  | { ok: true; feedbackId: number; duplicate: boolean }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryAfterSeconds?: number;
    };

function service() {
  return createServiceClient();
}

export async function loadFeedbackQrPublicContext(
  rawToken: string,
): Promise<FeedbackQrPublicContext | null> {
  const parsed = feedbackTokenSchema.safeParse(rawToken);
  if (!parsed.success) return null;

  const { data: qr } = await service()
    .from("feedback_qr_codes")
    .select("token, label, branch_id, tenant_id, is_active")
    .eq("token", parsed.data)
    .eq("is_active", true)
    .maybeSingle();

  if (!qr) return null;

  const { data: branch } = await service()
    .from("branches")
    .select("id, name, phone, google_review_url, is_active, branch_kind")
    .eq("id", qr.branch_id)
    .eq("tenant_id", qr.tenant_id)
    .maybeSingle();

  if (
    !branch ||
    !branch.is_active ||
    branch.branch_kind !== "branch"
  ) {
    return null;
  }

  return {
    token: qr.token,
    label: qr.label,
    branchName: branch.name,
    branchId: branch.id,
    branchPhone: branch.phone,
    googleReviewUrl: branch.google_review_url,
  };
}

export async function submitFeedbackRequest(input: {
  token: string;
  clientSubmissionId: string;
  rating: number;
  comment?: string;
  ipHash: string | null;
}): Promise<SubmitFeedbackResult> {
  const { data, error } = await service().rpc("submit_feedback", {
    p_token: input.token,
    p_client_submission_id: input.clientSubmissionId,
    p_rating: input.rating,
    // Generated Args mark TEXT params required; SQL accepts NULL and coerces.
    p_comment: (input.comment ?? null) as string,
    p_ip_hash: (input.ipHash ?? null) as string,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("feedback_rate_limited")) {
      let retryAfterSeconds = 900;
      try {
        const detail = error.details ? JSON.parse(error.details) : null;
        if (
          detail &&
          typeof detail === "object" &&
          typeof detail.retryAfterSeconds === "number"
        ) {
          retryAfterSeconds = detail.retryAfterSeconds;
        }
      } catch {
        // keep default
      }
      return {
        ok: false,
        status: 429,
        code: "rate_limited",
        message: "Bạn đã gửi nhiều phản hồi, vui lòng thử lại sau.",
        retryAfterSeconds,
      };
    }
    if (
      message.includes("feedback_token_invalid") ||
      message.includes("feedback_branch_inactive")
    ) {
      return {
        ok: false,
        status: 404,
        code: "invalid_token",
        message: "Mã QR không còn hiệu lực.",
      };
    }
    if (
      message.includes("feedback_rating_invalid") ||
      message.includes("feedback_comment_too_long") ||
      message.includes("feedback_client_submission_required")
    ) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: "Nội dung phản hồi không hợp lệ.",
      };
    }
    return {
      ok: false,
      status: 500,
      code: "internal",
      message: "Không gửi được phản hồi. Vui lòng thử lại.",
    };
  }

  const payload = data as {
    ok?: boolean;
    feedbackId?: number;
    duplicate?: boolean;
  } | null;

  if (!payload?.ok || typeof payload.feedbackId !== "number") {
    return {
      ok: false,
      status: 500,
      code: "internal",
      message: "Không gửi được phản hồi. Vui lòng thử lại.",
    };
  }

  if (payload.ok && !payload.duplicate && input.rating <= 2) {
    try {
      const { data: fb } = await service()
        .from("feedbacks")
        .select("id, branch_id, tenant_id")
        .eq("id", payload.feedbackId)
        .maybeSingle();

      if (fb) {
        const { data: branch } = await service()
          .from("branches")
          .select("name")
          .eq("id", fb.branch_id)
          .maybeSingle();

        const { data: depts } = await service()
          .from("work_departments")
          .select("id")
          .eq("tenant_id", fb.tenant_id)
          .eq("is_active", true);

        const deptId = depts?.[0]?.id;

        const { data: profiles } = await service()
          .from("profiles")
          .select("id")
          .eq("tenant_id", fb.tenant_id);

        const creatorId = profiles?.[0]?.id;

        if (deptId && creatorId) {
          const branchName = branch?.name ?? "Chi nhánh";
          const title = `[Sự cố - CSKH] Phản hồi ${input.rating} sao tại ${branchName}`;
          const commentText = input.comment?.trim() ? input.comment.trim() : "(Không có bình luận)";
          const description = `Chi nhánh: ${branchName}\nĐánh giá: ${input.rating}/5 sao\nÝ kiến khách: ${commentText}\nĐề nghị Quản lý và CSKH liên hệ xử lý khiếu nại sớm.`;

          await service().from("work_tasks").insert({
            tenant_id: fb.tenant_id,
            department_id: deptId,
            title,
            description,
            priority: input.rating === 1 ? "urgent" : "high",
            status: "todo",
            created_by: creatorId,
          });
        }
      }
    } catch {
      // Non-blocking side effect: feedback submission succeeds regardless
    }
  }

  return {
    ok: true,
    feedbackId: payload.feedbackId,
    duplicate: Boolean(payload.duplicate),
  };
}
