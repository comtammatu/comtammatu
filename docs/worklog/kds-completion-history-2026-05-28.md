# KDS Completion History - 2026-05-28

Surface: `/br/[branchId]/kds`
Primary user job: dau bep xem lai cac phieu bep da bam xong trong ngay.
Route family: branch-scoped operational KDS.
Change type: add global read-only completion history action.
Primitives: `Button`, `Sheet`, `Badge`, `ScrollArea`, `Spinner`, `Tooltip`.

PM: scope = add one global KDS history button, not a per-order audit action; acceptance = chef opens a sheet from the KDS header and sees recently completed kitchen tickets.
BA: rules = source of truth is `kds_tickets` with `status in ('ready', 'served')` and `bumped_at`; branch scope and KDS authorization still apply.
Dev: approach = add a Zod-validated Server Action, group tickets by `kitchen_send_batch_id` with order fallback, and keep queue cards/focus mode unchanged.
QA: tests = grouping/sorting helper coverage plus typecheck/lint/build; regressions = no queue reordering, no raw DB errors, no per-order history control.
