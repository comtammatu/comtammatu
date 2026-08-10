import { messages } from "@lib/messages";

const copy = messages.finance.bankTransactions;

/** Normalize SePay/null bank content for table + match sheet evidence. */
export function displayBankContent(content: string | null): string {
  const value = content?.trim();
  return value && value.toLowerCase() !== "null" ? value : copy.noContent;
}
