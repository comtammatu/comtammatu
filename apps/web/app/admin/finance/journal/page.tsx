import { Card, CardContent } from "@comtammatu/ui/components/card";
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
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tài chính
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Nhật ký kế toán
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
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
