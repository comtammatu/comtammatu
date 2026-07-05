ALTER TABLE public.tax_invoices ADD COLUMN buyer_email text;
COMMENT ON COLUMN public.tax_invoices.buyer_email IS
  'Buyer delivery email for Viettel S-invoice (buyerInfo.buyerEmail). NULL = no buyer email (khách lẻ / buyerNotGetInvoice). App-layer written only.';
