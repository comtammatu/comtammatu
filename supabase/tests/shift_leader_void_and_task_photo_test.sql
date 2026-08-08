-- pgTAP-style smoke checks for WP-C/D/E migrations (static SQL assertions via file presence).
-- Runtime verification belongs on a Preview Branch after apply.

BEGIN;

SELECT plan(6);

SELECT has_column('public', 'shift_assignments', 'is_shift_leader',
  'shift_assignments has is_shift_leader');

SELECT has_table('public', 'pos_void_requests',
  'pos_void_requests queue table exists');

SELECT has_function('public', 'request_pos_void_after_paid',
  'request_pos_void_after_paid exists');

SELECT has_function('public', 'resolve_pos_void_request',
  'resolve_pos_void_request exists');

SELECT has_column('public', 'position_shift_tasks', 'allows_photo',
  'position_shift_tasks.allows_photo exists');

SELECT has_column('public', 'attendance_checklist_items', 'photo_path',
  'attendance_checklist_items.photo_path exists');

SELECT * FROM finish();
ROLLBACK;
