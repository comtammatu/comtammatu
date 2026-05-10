-- Menu queries
-- Run: sqlc generate (from backend/) to regenerate internal/db/sqlc/
-- Requires sqlc CLI: go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

-- name: ListMenuCategories :many
-- SELECT id, tenant_id, name, sort_order, is_active, created_at
-- FROM menu_categories
-- WHERE tenant_id = $1 AND is_active = true
-- ORDER BY sort_order, name;
