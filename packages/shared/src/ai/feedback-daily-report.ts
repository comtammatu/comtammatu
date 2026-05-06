import { createAnthropicClient, getFeedbackAiModel, calcLlmCostUsd } from "./anthropic-client";
import type { AiSeverity } from "./feedback-enrichment";
import type { FeedbackCategory } from "../feedback/constants";

export interface DailyReportFeedbackItem {
  rating: number;
  comment: string;
  ai_categories: FeedbackCategory[] | null;
  ai_severity: AiSeverity | null;
  created_at: string;
}

export interface DailyReportInput {
  branch_name: string | null; // null = tenant-wide rollup
  report_date: string; // YYYY-MM-DD
  feedbacks: DailyReportFeedbackItem[];
}

export interface DailyReportResult {
  report_md: string;
  metrics_json: Record<string, unknown>;
  llm_model: string;
  llm_cost_usd: number;
  feedback_count: number;
  avg_rating: number | null;
}

function buildMetrics(
  feedbacks: DailyReportFeedbackItem[],
): Record<string, unknown> {
  if (feedbacks.length === 0) return {};
  const ratings = feedbacks.map((f) => f.rating);
  const sum = ratings.reduce((a, b) => a + b, 0);
  const avg = sum / ratings.length;

  const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) {
    if (r >= 1 && r <= 5) ratingDist[r] = (ratingDist[r] ?? 0) + 1;
  }

  const categoryCounts: Record<string, number> = {};
  for (const f of feedbacks) {
    for (const cat of f.ai_categories ?? []) {
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }
  }

  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of feedbacks) {
    if (f.ai_severity) {
      severityCounts[f.ai_severity] = (severityCounts[f.ai_severity] ?? 0) + 1;
    }
  }

  return {
    feedback_count: feedbacks.length,
    avg_rating: Math.round(avg * 100) / 100,
    rating_distribution: ratingDist,
    top_categories: Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cat, count]) => ({ cat, count })),
    severity_counts: severityCounts,
  };
}

function buildUserPrompt(input: DailyReportInput): string {
  const scopeLabel = input.branch_name ?? "Toàn hệ thống";
  const metrics = buildMetrics(input.feedbacks);
  const avgRating =
    typeof metrics["avg_rating"] === "number"
      ? metrics["avg_rating"].toFixed(2)
      : "N/A";

  const feedbackSummary = input.feedbacks
    .slice(0, 50) // cap to avoid context overflow
    .map((f, i) => {
      // Escape closing tags to prevent prompt injection from feedback content
      const safeComment = f.comment.replace(/</g, "&lt;").slice(0, 200);
      const cats = (f.ai_categories ?? []).join(", ") || "chưa phân loại";
      return `<feedback_${i + 1}>Rating ${f.rating}/5 | Nhóm: ${cats} | ${safeComment}</feedback_${i + 1}>`;
    })
    .join("\n");

  return `Tạo báo cáo ngày ${input.report_date} cho ${scopeLabel}.

Tổng số phản hồi: ${input.feedbacks.length}
Điểm trung bình: ${avgRating}/5

Danh sách phản hồi:
${feedbackSummary}

Hãy viết báo cáo markdown 200-500 từ gồm:
1. **Tổng quan** (số lượng, điểm trung bình)
2. **Top 3 vấn đề** (gom nhóm theo category, ví dụ cụ thể)
3. **Top 3 lời khen** (nếu có)
4. **Hành động đề xuất** (cụ thể, khả thi)`;
}

/**
 * Calls Claude to generate a daily markdown report for a branch/tenant.
 */
export async function generateDailyReport(
  input: DailyReportInput,
): Promise<DailyReportResult> {
  const model = getFeedbackAiModel();
  const client = createAnthropicClient();
  const metrics = buildMetrics(input.feedbacks);
  const feedbackCount = input.feedbacks.length;
  const avgRating =
    typeof metrics["avg_rating"] === "number" ? metrics["avg_rating"] : null;

  if (feedbackCount === 0) {
    return {
      report_md: "Không có phản hồi nào trong ngày.",
      metrics_json: metrics,
      llm_model: model,
      llm_cost_usd: 0,
      feedback_count: 0,
      avg_rating: null,
    };
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system:
        "Bạn là trợ lý phân tích kinh doanh cho nhà hàng Cơm Tấm Má Tư. Viết báo cáo ngắn gọn, thực tế, bằng tiếng Việt.",
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });

    const usage = response.usage;
    const llm_cost_usd = calcLlmCostUsd(
      model,
      usage.input_tokens,
      usage.output_tokens,
    );

    const textBlock = response.content.find((b) => b.type === "text");
    const report_md =
      textBlock?.type === "text"
        ? textBlock.text
        : "Không thể tạo báo cáo.";

    return {
      report_md,
      metrics_json: metrics,
      llm_model: model,
      llm_cost_usd,
      feedback_count: feedbackCount,
      avg_rating: avgRating,
    };
  } catch (err) {
    console.error("[generateDailyReport] error date=%s", input.report_date, err);
    return {
      report_md: "Lỗi khi tạo báo cáo AI.",
      metrics_json: metrics,
      llm_model: model,
      llm_cost_usd: 0,
      feedback_count: feedbackCount,
      avg_rating: avgRating,
    };
  }
}
