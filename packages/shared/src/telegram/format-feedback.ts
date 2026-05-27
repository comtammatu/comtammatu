/**
 * Render a feedback row as Telegram MarkdownV2 message.
 * Includes deep link to admin dashboard. Truncates comment > 500 chars.
 *
 * MarkdownV2 requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */

const MARKDOWNV2_ESCAPE = /[_*[\]()~`>#+\-=|{}.!]/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWNV2_ESCAPE, "\\$&");
}

const RATING_EMOJI: Record<number, string> = {
  1: "😡",
  2: "😞",
  3: "😐",
  4: "🙂",
  5: "🤩",
};

export function formatFeedbackTelegramMessage(args: {
  feedback_id: number;
  rating: number;
  comment: string;
  branch_name: string;
  qr_label: string;
  has_phone: boolean;
  /** e.g. https://app.example.com/admin/feedback?id=123 */
  admin_url: string;
  /** ISO timestamp */
  created_at: string;
}): string {
  const ratingEmoji = RATING_EMOJI[args.rating] ?? "❓";
  const truncated =
    args.comment.length > 500 ? args.comment.slice(0, 500) + "…" : args.comment;
  const lines: string[] = [];
  lines.push(`🔔 *Phản ánh khách* ${ratingEmoji} \\(${args.rating}/5\\)`);
  lines.push(`🏪 ${escapeMarkdownV2(args.branch_name)}`);
  lines.push(`🏷️ ${escapeMarkdownV2(args.qr_label)}`);
  if (args.has_phone) {
    lines.push(`📞 _Khách để lại số điện thoại_`);
  }
  lines.push("");
  lines.push(`💬 ${escapeMarkdownV2(truncated)}`);
  lines.push("");
  lines.push(`🔗 [Xem chi tiết](${args.admin_url})`);
  return lines.join("\n");
}
