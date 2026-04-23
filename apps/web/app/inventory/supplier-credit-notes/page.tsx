import { fetchCreditNotes } from "../credit-note-actions";
import { CreditNotesClient } from "./credit-notes-client";

export default async function CreditNotesPage() {
  const res = await fetchCreditNotes();
  const rows = res.success ? ((res.data as CreditNoteRow[]) ?? []) : [];
  return (
    <CreditNotesClient
      rows={rows}
      error={res.success ? null : (res.error ?? "Không thể tải danh sách.")}
    />
  );
}

type CreditNoteRow = {
  id: number;
  credit_number: string;
  kind: string;
  amount: number;
  applied_amount: number;
  status: string;
  created_at: string;
  applied_at: string | null;
  supplier_id: number;
  return_id: number;
  invoice_id: number | null;
  suppliers: { id: number; name: string } | null;
  supplier_returns: { id: number; return_number: string } | null;
  supplier_invoices: { id: number; invoice_number: string } | null;
};
