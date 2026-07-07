ALTER TABLE webhook_events
ADD COLUMN expense_id bigint REFERENCES expenses(id) ON DELETE SET NULL;
