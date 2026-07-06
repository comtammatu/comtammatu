DROP TRIGGER trg_enforce_ingredient_stock ON public.order_items;

DROP FUNCTION public.enforce_branch_ingredient_stock();

DROP FUNCTION public.get_branch_menu_ingredient_caps_for_pos(bigint);

DROP FUNCTION public.branch_kitchen_ingredient_availability(bigint, bigint);

DELETE FROM public.branch_feature_flags WHERE flag_key = 'pos_ingredient_stock_block';
