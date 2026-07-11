-- =========================================================================
-- View: v_print_agent_fleet — fleet-wide migration tracker cho ops/admin.
--
-- Bối cảnh: print-agent đã chuyển sang Node-only path từ release 0.2.0
-- (2026-05-03). Một số chi nhánh deploy trước commit 98ce5c7 (2026-04-end)
-- vẫn chạy .exe legacy với hardcoded version "0.1.0".
--
-- Ops dùng view này để track migration progress mà không phải SSH/RDP từng
-- chi nhánh. Status field tự derive từ printer_agents.version + last_seen_at:
--   - migrated_node: version >= 0.2.0 + đang online
--   - legacy_or_offline: version = 0.1.0 (chưa migrate)
--   - never_started: chưa từng có heartbeat row
--   - offline: có row nhưng last_seen_at > 5 phút trước (agent down)
--   - active_unknown_version: version null hoặc format lạ
--
-- Sau khi 100% chi nhánh migrate xong, có thể drop view này.
-- =========================================================================

CREATE OR REPLACE VIEW public.v_print_agent_fleet AS
SELECT
  b.id                                AS branch_id,
  b.tenant_id,
  b.name                              AS branch_name,
  pa.agent_id,
  pa.version,
  pa.transport,
  pa.last_seen_at,
  EXTRACT(EPOCH FROM (now() - pa.last_seen_at))::INT AS seconds_since_seen,
  CASE
    WHEN pa.branch_id IS NULL THEN 'never_started'
    WHEN pa.last_seen_at < now() - INTERVAL '5 minutes' THEN 'offline'
    WHEN pa.version IS NULL OR pa.version = '' THEN 'active_unknown_version'
    -- Semantic version compare: split major.minor.patch, lexically nhỏ hơn
    -- 0.2.0 → legacy. Đủ chính xác cho 0.x.y pre-1.0 fleet hiện tại.
    WHEN string_to_array(pa.version, '.')::INT[] < ARRAY[0,2,0]
      THEN 'legacy_or_offline'
    ELSE 'migrated_node'
  END                                 AS status
FROM public.branches b
LEFT JOIN public.printer_agents pa
  ON pa.branch_id = b.id
WHERE b.is_active = TRUE;

-- View kế thừa RLS từ base table `printer_agents` qua barrier (security_invoker).
-- Postgres 15+ default cho view là security_invoker khi tạo qua CREATE VIEW
-- thông thường, nhưng explicit set để chắc chắn.
ALTER VIEW public.v_print_agent_fleet SET (security_invoker = true);

GRANT SELECT ON public.v_print_agent_fleet TO authenticated;

COMMENT ON VIEW public.v_print_agent_fleet IS
  'Fleet-wide print-agent migration tracker. Status derived from version + '
  'last_seen_at. Filter status=''legacy_or_offline'' để liệt kê chi nhánh '
  'cần migrate sang Node path. RLS inherits from printer_agents (manager+).';
