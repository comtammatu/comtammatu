-- Data Patch: Force close all stale attendance records from 2026-07-06 and earlier
-- Action: Set check_out = check_in (0 working hours)

UPDATE public.attendance_records
SET 
  check_out = check_in,
  note = COALESCE(note || ' | ', '') || 'Hệ thống tự động đóng ca treo (0 giờ công)',
  updated_at = TIMEZONE('utc', NOW())
WHERE 
  check_in IS NOT NULL 
  AND check_out IS NULL 
  AND date <= '2026-07-06';
