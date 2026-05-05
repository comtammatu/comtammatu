import { PageHero } from "@/components/page-hero";
import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
import { fetchJournalEntries } from "../journal-actions";
import { JournalClient } from "./journal-client";

interface RawJournalEntryLine {
  id: number;
  account_id: number;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
}

interface RawJournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  reference_type: string;
  reference_id: number | null;
  status: string;
  created_at: string;
  journal_entry_lines: RawJournalEntryLine[];
}

interface RawAccount {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  is_active: boolean;
}

export default async function JournalPage() {
  const [entriesRes, accountsRes] = await Promise.all([
    fetchJournalEntries(),
    fetchChartOfAccounts(),
  ]);

  const entries = entriesRes.success
    ? ((entriesRes.data ?? []) as RawJournalEntry[]).map((entry) => ({
        id: entry.id,
        entry_number: entry.entry_number,
        entry_date: entry.entry_date,
        description: entry.description,
        ref_type: entry.reference_type,
        ref_id: entry.reference_id,
        status: entry.status,
        created_at: entry.created_at,
        journal_entry_lines: entry.journal_entry_lines.map((line) => ({
          id: line.id,
          account_id: line.account_id,
          debit: Number(line.debit_amount),
          credit: Number(line.credit_amount),
          description: line.description,
        })),
      }))
    : [];
  const accounts = accountsRes.success
    ? ((accountsRes.data ?? []) as RawAccount[]).map((account) => ({
        id: account.id,
        code: account.account_code,
        name: account.account_name,
        account_type: account.account_type,
        is_active: account.is_active,
      }))
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
