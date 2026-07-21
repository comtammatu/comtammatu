export interface InvoiceOutcome {
  status: "queued" | "reconcile_required";
  error?: string;
}
