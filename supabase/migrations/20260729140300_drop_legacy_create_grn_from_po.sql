-- D091/D092: GRN-first procurement. Authenticated PO→GRN creator must not
-- survive; recovery stays on create_grn_from_approved_po (service_role only).

DROP FUNCTION IF EXISTS public.create_grn_from_po(bigint);
