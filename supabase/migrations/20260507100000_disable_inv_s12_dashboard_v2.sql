-- Disable inv_s12_dashboard_v2 feature flag (Wave 3b 2026-05-07)
-- Dashboard v2 retired; v1 with MV-backed RPC port is canonical.
-- Reversible: re-run UPDATE with enabled=TRUE.

UPDATE branch_feature_flags
SET enabled = FALSE,
    updated_at = NOW()
WHERE flag_key = 'inv_s12_dashboard_v2';
