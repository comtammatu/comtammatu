export type WorkTaskDocumentLink = {
  type: "pos_session" | "feedback" | "count_slip" | "stock_issue" | "grn";
  label: string;
  href: string;
  id: string;
};

const NUMBER_PREFIX = "#";

export function resolveWorkTaskDocumentLink(task: {
  title: string;
  description?: string | null;
}): WorkTaskDocumentLink | null {
  const text = `${task.title} ${task.description ?? ""}`;

  // 1. POS Session: e.g. "Ca POS (id)" or "session: (id)"
  const posMatch = text.match(/(?:Ca\s+POS|pos_session)[\s#:]*(\d+)/i);
  if (posMatch?.[1]) {
    const sessionId = posMatch[1];
    // Try to extract branchId if present: "Mã: 4" or "Chi nhánh 4" or "branch_id: 4"
    const branchMatch =
      text.match(/(?:Chi\s+nhánh|CN|branch)[\s#:()]*(\d+)/i) ||
      text.match(/(?:Mã|ID)[\s:]*#?(\d+)/i);
    const branchId = branchMatch?.[1];

    return {
      type: "pos_session",
      id: sessionId,
      label: `Ca POS ${NUMBER_PREFIX}${sessionId}`,
      href: branchId
        ? `/br/${branchId}/pos-sessions?session=${sessionId}`
        : `/reports/pos-sessions?session=${sessionId}`,
    };
  }

  // 2. Feedback: e.g. "Phản hồi (id)" or "CSKH (id)"
  const feedbackMatch = text.match(/(?:Phản\s+hồi|feedback)[\s#:ID]*(\d+)/i);
  if (feedbackMatch?.[1]) {
    const feedbackId = feedbackMatch[1];
    return {
      type: "feedback",
      id: feedbackId,
      label: `Phản hồi ${NUMBER_PREFIX}${feedbackId}`,
      href: `/feedback`,
    };
  }

  // 3. Inventory Count: e.g. "Phiếu kiểm kê (id)" or "Kiểm kê (id)"
  const countMatch = text.match(/(?:Phiếu\s+kiểm\s+kê|Kiểm\s+kê)[\s#:]*(\d+)/i);
  if (countMatch?.[1]) {
    const countId = countMatch[1];
    return {
      type: "count_slip",
      id: countId,
      label: `Kiểm kê ${NUMBER_PREFIX}${countId}`,
      href: `/inventory`,
    };
  }

  // 4. Stock Issue: e.g. "Phiếu xuất (id)"
  const issueMatch = text.match(/Phiếu\s+xuất[\s#:]*(\d+)/i);
  if (issueMatch?.[1]) {
    const issueId = issueMatch[1];
    return {
      type: "stock_issue",
      id: issueId,
      label: `Phiếu xuất ${NUMBER_PREFIX}${issueId}`,
      href: `/inventory/issues/${issueId}`,
    };
  }

  // 5. GRN (Goods Received Note): e.g. "Phiếu nhập (id)"
  const grnMatch = text.match(/Phiếu\s+nhập[\s#:]*(\d+)/i);
  if (grnMatch?.[1]) {
    const grnId = grnMatch[1];
    return {
      type: "grn",
      id: grnId,
      label: `Phiếu nhập ${NUMBER_PREFIX}${grnId}`,
      href: `/inventory/grn/${grnId}`,
    };
  }

  return null;
}
