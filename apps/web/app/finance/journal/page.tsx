import { PageHero } from "@/components/page-hero";
import { fetchJournalEntries } from "../accounting-actions";
import { fetchChartOfAccounts } from "../accounting-actions";
import { JournalClient } from "./journal-client";

export default async function JournalPage() {
  const [entriesRes, accountsRes] = await Promise.all([
    fetchJournalEntries(),
    fetchChartOfAccounts(),
  ]);

  const entries = entriesRes.success
    ? ((entriesRes.data ?? []) as JournalEntryRow[])
    : [];
  const accounts = accountsRes.success
    ? ((accountsRes.data ?? []) as AccountOption[])
    : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHero eyebrow="Tài chính" title="Nhật ký kế toán" />
      <JournalClient entries={entries} accounts={accounts} />
    </div>
  );
}

export interface JournalEntryLine {
  id: number;
  account_id: number;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntryRow {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  ref_type: string | null;
  ref_id: number | null;
  status: string;
  created_at: string;
  journal_entry_lines: JournalEntryLine[];
}

export interface AccountOption {
  id: number;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
}
