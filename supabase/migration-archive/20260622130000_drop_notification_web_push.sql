-- Drop the server Web Push delivery layer.
--
-- Web Push (VAPID-signed pushes dispatched by /api/cron/notifications-push to
-- stored browser subscriptions) is replaced by foreground OS popups fired via
-- the Notification API while the PWA is open. The in-app notification feed
-- (notifications + notification_reads, the list_notifications /
-- count_unread_notifications RPCs) is unchanged.
--
-- Removed objects, in dependency order:
--   - claim_notification_push_delivery(bigint, bigint, integer, integer)
--   - notification_push_deliveries (FK -> notification_push_subscriptions)
--   - notification_push_subscriptions
-- DROP TABLE also removes the owned indexes, RLS policies, and id sequence.

DROP FUNCTION IF EXISTS public.claim_notification_push_delivery(bigint, bigint, integer, integer);
DROP TABLE IF EXISTS public.notification_push_deliveries;
DROP TABLE IF EXISTS public.notification_push_subscriptions;
