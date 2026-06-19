# HRM Checkout Consumption Checklist Contract

Skill plan: repo rules = engineering + skills + database + UI + workflow + team + references; external skills = shadcn, supabase, supabase-postgres-best-practices; runtime tools = CodeGraph, Supabase CLI for migration file creation, shell tests; skipped = no live database apply because the only configured project is production.

Tier: T3, because the change adds production migrations for HRM checklist templates plus a consumption-report approval workflow that can post Inventory movements. The migrations are file-only and idempotent; owner applies them through the normal production flow.

PM:
- Scope is narrow: keep the existing daily-work loop and add one optional daily kitchen consumption item per canonical checklist template, backed by a report/approval workflow.
- Done means staff who are assigned consumption reporting submit line-level consumption; staff who are not assigned it are not blocked from checkout.
- Inventory is not touched by employee submit. It is applied only when the checkout approver accepts the submitted consumption report.
- Out of scope: creating a new `cleaner` position, changing payroll math, or forcing one default checklist for every `chef` profile.

BA:
- The checklist remains binary: `Chưa làm` or `Xong`.
- The new item is `end_of_shift`, `closing`, and `is_required=false`, so it appears on the closing shift snapshot but does not block checkout through the existing `checklist_incomplete` RPC rule.
- Each template gets a role-specific done definition covering the default ingredients, supplies, or operating materials that position may need to report as daily consumption or loss.
- The business purpose is consumption visibility for branch management and a later net-revenue view, not a required stock-count gate for every employee.
- Report statuses are `draft -> submitted -> applied` for a clean report and `submitted -> needs_changes -> submitted` when the Branch Manager requests correction.
- Requesting correction clears the pending checkout request and reopens the consumption checklist item so the employee can fix and resubmit.
- If the employee has no consumption to report, they must explicitly submit `no_consumption`; the approver confirms it as `approved` with no Inventory movement.
- If an applied report is found wrong later, the report stays immutable and the correction goes through Inventory document correction against the generated issue.
- Kitchen station templates stay per-person when the single `chef` position maps to multiple stations.

Senior Dev:
- Use a new migration after the existing seed instead of editing older seed files, because the target environment may already have applied prior HRM migrations.
- Do not grant browser write access to report tables. Employee submit, manager correction, and manager approval go through SECURITY DEFINER RPCs.
- Clock-in still snapshots checklist items through `employee_clock_in_with_checklist`; checkout still uses `employee_request_clock_out`.
- The approval RPC creates a confirmed `stock_issues` document and `stock_movements` only after branch-manager checkout approval permission passes.
- Default ingredients are configured on `shift_checklist_consumption_default_items` by checklist template item, then copied into the employee UI from the attendance checklist snapshot's `template_item_id`.
- The approval RPC is idempotent for already `approved`/`applied` reports so double-clicks cannot create duplicate Inventory issues.
- Checkout approval must block when a consumption report is still `submitted` or `needs_changes`.

QA:
- Static tests should assert the checklist migration contains all seven canonical templates, uses `end_of_shift`, `closing`, and the exact daily-consumption title.
- Static tests should assert employee report submit does not insert `stock_issues`/`stock_movements`, while manager approval does, and adjustment clears checkout pending state.
- Static tests should assert `Không phát sinh`, `Duyệt & áp Inventory`, default-item trace, and HRM-source Inventory correction links stay wired.
- Existing Employee tests already cover service-role clock-in, required checklist gating, and checkout approval state.
- Full `pnpm typecheck && pnpm lint && pnpm build` is required before closing if feasible in the dirty checkout; if blocked, report the exact blocker.

Unified contract:
- Employee daily flow becomes `Chấm công vào -> Việc trong ca -> Gửi báo cáo tiêu hao nếu được giao -> Gửi kết ca -> Trưởng chi nhánh duyệt tiêu hao/apply Inventory hoặc yêu cầu chỉnh sửa -> Duyệt kết ca -> Hoàn thành`.
- HR owns setup and review: employee records, attendance/day-work review, checklist templates, defaults, and payroll support.
- The checklist migration adds no required-checklist gate. The approval migration adds report/default tables, RLS, RPCs, no-consumption audit, and HRM-source Inventory trace, but no production apply in this agent run.
