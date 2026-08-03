BEGIN;

ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_grn_id_ingredient_id_tenant_id_key;

COMMIT;
