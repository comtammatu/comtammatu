alter table public.tax_invoices
  add column if not exists buyer_email text;
