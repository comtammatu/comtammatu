-- =============================================================
-- Grant pos:print / pos:send_kitchen / printer:manage to role templates
--
-- Sprint 3 follow-up: the 3 new permission keys from S1 were inserted into
-- permission_keys but never added to any role_template → existing users
-- cannot manage printers / send kitchen tickets / print receipts until we
-- sync their staff_permissions. Fix idempotently.
-- =============================================================

-- printer:manage → owner, super_manager, quan_ly_vung, quan_ly_CN
UPDATE public.role_templates
   SET permission_keys = ARRAY(SELECT DISTINCT UNNEST(permission_keys || ARRAY['printer:manage']))
 WHERE position_code IN ('owner', 'super_manager', 'quan_ly_vung', 'quan_ly_CN')
   AND NOT ('printer:manage' = ANY(permission_keys));

-- pos:print → owner, super_manager, quan_ly_vung, quan_ly_CN, cashier, waiter
UPDATE public.role_templates
   SET permission_keys = ARRAY(SELECT DISTINCT UNNEST(permission_keys || ARRAY['pos:print']))
 WHERE position_code IN ('owner', 'super_manager', 'quan_ly_vung', 'quan_ly_CN', 'cashier', 'waiter')
   AND NOT ('pos:print' = ANY(permission_keys));

-- pos:send_kitchen → owner, super_manager, quan_ly_vung, quan_ly_CN, cashier, waiter
UPDATE public.role_templates
   SET permission_keys = ARRAY(SELECT DISTINCT UNNEST(permission_keys || ARRAY['pos:send_kitchen']))
 WHERE position_code IN ('owner', 'super_manager', 'quan_ly_vung', 'quan_ly_CN', 'cashier', 'waiter')
   AND NOT ('pos:send_kitchen' = ANY(permission_keys));

-- Backfill existing users' staff_permissions from the updated templates
SELECT public.sync_missing_permissions_from_template();
