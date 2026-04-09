# M5-Ext S1: Stocktake Migration + RPC — Session Prompt

> Copy-paste vào Claude Code session mới để bắt đầu.
> Sử dụng Team Agents: Database Agent + Backend Agent song song.

---

## Prompt (paste vào Claude)

```
Bắt đầu session M5-Ext S1: Stocktake Migration + RPC.

## Context

- Plan đầy đủ: `docs/plan/m5-stock-enhancement.md` (đọc Phase 0, S1)
- Roadmap: `docs/plan/roadmap.md` (section M5-Ext)
- Inventory spec: `docs/ref/inventory.md`
- Existing M5 enterprise migration: `supabase/migrations/20260409000000_m5_stock_enterprise.sql`
- Existing actions: `apps/web/app/admin/inventory/actions.ts`
- Session protocol: `.claude/rules/session-protocol.md`
- Quality gates: `.claude/rules/quality-gates.md`
- Regressions: `tasks/regressions.md`

## Task Contract

===== TASK CONTRACT =====
SESSION: M5-Ext S1
TASK: Stocktake — Database migration + RPC + Server Actions + GRN temperature ALTER
SCOPE:
  Files to CREATE:
  - supabase/migrations/20260415000000_m5ext_stocktake.sql
  Files to MODIFY:
  - apps/web/app/admin/inventory/actions.ts (add stocktake actions)
  - packages/database/src/types/database.types.ts (after db:types)
CONSTRAINTS:
  - Follow existing migration patterns (see 20260409000000_m5_stock_enterprise.sql)
  - BIGINT PK, tenant_id FK, TIMESTAMPTZ, TEXT (no VARCHAR)
  - GRANT SELECT,INSERT,UPDATE TO authenticated on new tables
  - RLS enabled + policies per role
  - UNIQUE constraints composite with tenant_id
  - Append-only: stock_movements trigger already handles count_adjustment
  - NEVER apply migration — write file only
COMPLETION CRITERIA:
  - [ ] Migration file written with: stocktake_sessions, stocktake_lines, RPC complete_stocktake, ALTER grn_items.receiving_temperature, INDEX idx_grn_items_expiry
  - [ ] Server Actions written: createStocktakeSession, fetchStocktakeSessions, fetchStocktakeDetail, updateStocktakeLine, completeStocktake, cancelStocktake, fetchExpiryAlerts, fetchReorderAlerts
  - [ ] pnpm typecheck && pnpm lint && pnpm build passes
ESTIMATE: 1 session
==========================

## Sử dụng Team Agents

Spawn 2 agents song song:

### Agent 1: Database Agent
Scope: Migration file only.

Prompt cho agent:
---
You are the DATABASE AGENT for M5-Ext S1.

Read the plan: docs/plan/m5-stock-enhancement.md (Phase 0, S1 section)
Read existing migration pattern: supabase/migrations/20260409000000_m5_stock_enterprise.sql

Write migration file: supabase/migrations/20260415000000_m5ext_stocktake.sql

Contents must include:

1. CREATE TABLE stocktake_sessions
   - id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
   - tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
   - branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT
   - started_at TIMESTAMPTZ NOT NULL DEFAULT now()
   - completed_at TIMESTAMPTZ
   - status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled'))
   - notes TEXT
   - created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()

2. CREATE TABLE stocktake_lines
   - id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
   - tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
   - session_id BIGINT NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE
   - ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT
   - system_quantity NUMERIC(15,3) NOT NULL
   - counted_quantity NUMERIC(15,3)
   - variance NUMERIC(15,3) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED
   - variance_reason TEXT
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   - UNIQUE (session_id, ingredient_id, tenant_id)

3. Partial unique index: only one active stocktake per branch
   CREATE UNIQUE INDEX idx_one_active_stocktake_per_branch
     ON stocktake_sessions(branch_id, tenant_id) WHERE status = 'in_progress';

4. GRANT SELECT, INSERT, UPDATE ON stocktake_sessions, stocktake_lines TO authenticated;

5. RLS policies on both tables:
   - SELECT: tenant match (auth_tenant_id())
   - INSERT: tenant match + role IN ('owner','super_manager','area_manager','branch_manager')
   - UPDATE: tenant match + role IN ('owner','super_manager','area_manager','branch_manager')
   - branch_manager: branch_id must match auth_branch_id() for sessions
   - No DELETE policy (never delete stocktake records)

6. RPC complete_stocktake(p_session_id BIGINT) RETURNS JSONB:
   - SECURITY DEFINER, SET search_path = public
   - Lock session FOR UPDATE, verify status = 'in_progress'
   - Verify ALL lines have counted_quantity IS NOT NULL
   - For each line:
     a. Read FRESH stock_levels.current_quantity for that ingredient+branch (re-snapshot)
     b. Compute adjustment = counted_quantity - fresh_current_quantity
     c. If adjustment != 0: INSERT INTO stock_movements (tenant_id, branch_id, ingredient_id, type='count_adjustment', quantity_change=adjustment, reason=variance_reason, created_by=auth.uid())
     d. The existing trigger trg_update_stock_on_movement handles stock_levels update + last_counted_at
   - UPDATE stocktake_sessions SET status='completed', completed_at=now()
   - Return JSON: { success: true, total_lines, adjusted_lines, total_variance_abs }
   - GRANT EXECUTE ON FUNCTION complete_stocktake TO authenticated

7. ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS receiving_temperature NUMERIC(5,1);

8. CREATE INDEX IF NOT EXISTS idx_grn_items_expiry ON grn_items(expiry_date) WHERE expiry_date IS NOT NULL;

9. Standard indexes:
   - idx_stocktake_sessions_tenant ON stocktake_sessions(tenant_id)
   - idx_stocktake_sessions_branch ON stocktake_sessions(branch_id)
   - idx_stocktake_lines_session ON stocktake_lines(session_id)

Follow EXACTLY the patterns in the existing migration file for comments, formatting, and structure.
Do NOT apply the migration. Write the file only.
---

### Agent 2: Backend Agent
Scope: Server Actions only. Waits for Database Agent to finish (needs to know exact table/column names).

Prompt cho agent:
---
You are the BACKEND AGENT for M5-Ext S1.

Read the plan: docs/plan/m5-stock-enhancement.md (Phase 0, S1+S2+S3 sections)
Read existing actions pattern: apps/web/app/admin/inventory/actions.ts
Read existing procurement actions: apps/web/app/admin/inventory/procurement-actions.ts
Read module ACL: packages/shared/src/auth/module-acl.ts
Read inventory roles: packages/shared/src/auth/inventory-roles.ts
Read the migration file written by DB agent: supabase/migrations/20260415000000_m5ext_stocktake.sql

Add the following Server Actions to apps/web/app/admin/inventory/actions.ts:

STOCKTAKE ACTIONS:
1. fetchStocktakeSessions(branchId?: number) — list sessions for branch (or all if super_manager)
2. createStocktakeSession(branchId: number) — create session + auto-populate lines from stock_levels for that branch
   - For each ingredient that has a stock_level row at this branch:
     INSERT stocktake_line with system_quantity = current stock_levels.current_quantity
   - Use INVENTORY_OPS_ROLES
3. fetchStocktakeDetail(sessionId: number) — get session + all lines with ingredient names
4. updateStocktakeLine(lineId: number, countedQuantity: number, varianceReason?: string) — update counted_quantity for a single line
   - Only allow if session status = 'in_progress'
5. completeStocktake(sessionId: number) — call RPC complete_stocktake
6. cancelStocktake(sessionId: number) — set status = 'cancelled' if still in_progress

ALERT ACTIONS:
7. fetchExpiryAlerts(branchId?: number) — query grn_items with expiry_date within 7 days, joined to ingredients
   - Return: ingredient name, batch_number, expiry_date, days_remaining, grn_number, branch_name
   - Group by urgency: expired (<=0 days), critical (1-3 days), warning (4-7 days)
8. fetchReorderAlerts(branchId?: number) — compare stock_levels.current_quantity vs ingredients.reorder_point
   - Return items where current_quantity <= reorder_point
   - Include: ingredient name, current_quantity, reorder_point, unit, suggested_order_qty (max_stock_level - current_quantity), preferred supplier (from recent PO)
   - Group by supplier for easy PO creation

All actions must:
- Use Zod validation for inputs
- Get auth context (tenant_id, branch_id, user_role) from createServerClient
- Check role against INVENTORY_OPS_ROLES
- Return { success, data?, error? } shape
- Never return raw DB errors
- branch_manager can only see own branch data

After writing actions, run: pnpm typecheck && pnpm lint && pnpm build
Fix any errors until it passes.
---

## Verification

After both agents complete:
1. Review migration file for correctness
2. Review actions for Zod validation + auth + safe errors
3. Run /verify (pnpm typecheck && pnpm lint && pnpm build)
4. Run /review (code review for bugs CI misses)
5. Checkpoint commit: feat(inventory): M5-Ext S1 — stocktake migration + RPC + actions
6. Update roadmap: S1 → ✅
```

---

## Notes

- Database agent runs first, backend agent starts after migration file exists
- Migration file is NOT applied — owner runs `supabase db push` after merge
- `pnpm db:types` cannot run until migration is applied, so backend actions will reference tables by known column names (from migration). TypeScript types will be available after migration applied + db:types.
- If typecheck fails due to missing types, create a temporary type interface in actions file with `// TODO: remove after pnpm db:types`
