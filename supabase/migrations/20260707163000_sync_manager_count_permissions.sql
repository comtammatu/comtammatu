-- Sync missing permissions from role templates to active staff permissions.
-- Specifically backfills 'inventory:count_assign' and 'inventory:count_approve'
-- which were added to templates but not existing users.

SELECT public.sync_missing_permissions_from_template();
