-- Realtime PR6 — POS menu-structure sync via ops bus

-- 1. Create the trigger function to broadcast menu changes
CREATE OR REPLACE FUNCTION public.broadcast_menu_ops()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_row jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_tenant bigint := (v_row ->> 'tenant_id')::bigint;
  v_payload jsonb;
  v_branch record;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  v_payload := jsonb_build_object(
    'domain', 'pos',
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', v_row ->> 'id',
    'at', now()
  );

  BEGIN
    -- Broadcast to all branches belonging to this tenant
    FOR v_branch IN
      SELECT id FROM public.branches WHERE tenant_id = v_tenant
    LOOP
      PERFORM realtime.send(v_payload, 'ops', 'branch:' || v_branch.id || ':ops', true);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_menu_ops best-effort send failed (table=%, op=%): %',
      TG_TABLE_NAME, TG_OP, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_menu_ops() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.broadcast_menu_ops() IS
  'AFTER trigger: broadcasts a thin {domain,table,op,id,at} signal to branch:{id}:ops for all branches under the same tenant on menu changes.';

-- 2. Attach the trigger to menu-related tables
DROP TRIGGER IF EXISTS tr_menu_categories_broadcast_ops ON public.menu_categories;
CREATE TRIGGER tr_menu_categories_broadcast_ops
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_menu_ops();

DROP TRIGGER IF EXISTS tr_menu_items_broadcast_ops ON public.menu_items;
CREATE TRIGGER tr_menu_items_broadcast_ops
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_menu_ops();

DROP TRIGGER IF EXISTS tr_menu_item_variants_broadcast_ops ON public.menu_item_variants;
CREATE TRIGGER tr_menu_item_variants_broadcast_ops
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_item_variants
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_menu_ops();

DROP TRIGGER IF EXISTS tr_menu_item_modifiers_broadcast_ops ON public.menu_item_modifiers;
CREATE TRIGGER tr_menu_item_modifiers_broadcast_ops
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_menu_ops();

DROP TRIGGER IF EXISTS tr_menu_item_available_sides_broadcast_ops ON public.menu_item_available_sides;
CREATE TRIGGER tr_menu_item_available_sides_broadcast_ops
  AFTER INSERT OR UPDATE OR DELETE ON public.menu_item_available_sides
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_menu_ops();
