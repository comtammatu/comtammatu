/** OCR and receipt-footer helpers shared by the relay parser and menu mapping. */

const RECEIPT_FOOTER_LINE =
  /^(?:tổng\s*m[oóớòôốộơỡ]*n|tống\s*ti[eêểề]n|tổng\s*cộng|tổng\s*ti[eêểề]n|tạm\s*tính|thành\s*tiền|thanh\s*toán|chiết\s*khấu|giảm\s*gi[aáả])/i;

const CUSTOMER_NOTE_LABEL =
  /ghi\s*ch[uúủ]\s*(?:của\s*)?khách(?:\s*hàng)?[:\s]+/i;

const ITEM_NOTE_LABEL = /^ghi\s*ch[uúủ]\s*:\s*/i;

const OPTION_NOTE = /tùy\s*chọn:\s*([^•]+)/gi;

export function isReceiptFooterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (CUSTOMER_NOTE_LABEL.test(trimmed)) return true;
  return RECEIPT_FOOTER_LINE.test(trimmed);
}

export function extractCustomerNoteFromLine(line: string): string | null {
  const parts = line.split(CUSTOMER_NOTE_LABEL);
  if (parts.length < 2) return null;
  const note = stripReceiptFooterTokens(parts[parts.length - 1] ?? "");
  return note || null;
}

/** Strips glued OCR quantity prefixes such as `Ix`, `1x`, or `x` before a name. */
export function sanitizeDeliveryOptionName(name: string): string {
  return name
    .trim()
    .replace(/^(?:[Il1]|\d+)\s*[xX]\s*/, "")
    .replace(/^[xX](?=\p{L})/u, "")
    .trim();
}

export function sanitizeDeliveryItemNote(
  note: string | null | undefined,
): string | null {
  if (!note?.trim()) return null;
  const text = note.trim();
  const parts: string[] = [];

  const customerNote = extractCustomerNoteFromLine(text);
  if (customerNote) parts.push(customerNote);

  const optionMatches = text.matchAll(OPTION_NOTE);
  for (const match of optionMatches) {
    const value = (match[1] ?? "").trim();
    if (!value || isReceiptFooterLine(value)) continue;
    const cleanedOption = sanitizeDeliveryOptionName(value);
    if (cleanedOption) parts.push(`Tùy chọn: ${cleanedOption}`);
  }

  if (parts.length === 0) {
    const cleaned = stripReceiptFooterTokens(text.replace(ITEM_NOTE_LABEL, ""));
    if (cleaned && !isReceiptFooterLine(cleaned)) parts.push(cleaned);
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}

function stripReceiptFooterTokens(value: string): string {
  return value
    .replace(
      /(?:tổng\s*m[oóớòôốộơỡ]*n|tống\s*ti[eêểề]n|tổng\s*cộng|tổng\s*ti[eêểề]n|tạm\s*tính|thành\s*tiền|chiết\s*khấu|giảm\s*gi[aáả]|giá\s*gốc)\S*/gi,
      " ",
    )
    .replace(/[-+]?\d[\d.,]*\s*(?:đ|d|vnd)?/gi, " ")
    .replace(/\bcà\s*chu\s+a\b/gi, "cà chua")
    .replace(/[•·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
