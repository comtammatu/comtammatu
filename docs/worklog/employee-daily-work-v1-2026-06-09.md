# Employee Daily Work v1 - T3 Contract

Date: 2026-06-09

## Surface

- Surface: Employee daily work loop in `apps/web`.
- Primary user job: staff opens `/employee`, sees exactly the next work action, then moves through `Chấm công vào -> Việc trong ca -> Kết ca làm -> Hoàn thành`.
- Route family: `/employee`, `/employee/clock`, `/employee/tasks`, Admin branch attendance config.
- Change type: schema/RLS/RPC/storage hardening plus Employee UX simplification.
- Primitives: existing Employee shell, `AppSection`, shadcn Button/Input/Checkbox/Dialog/Item/Alert.
- Motion/effect role: none beyond native camera capture/QR scanning and lightweight pending state.

## T3 Debate

PM:
- Build the small daily loop now; do not expand Employee into HRM portal.
- Acceptance is one primary CTA per state, photo-only clock-in, binary checklist, code/QR checkout, and no GPS in Employee v1.
- Admin config can be minimal: checklist items per branch and checkout code visibility/regeneration.

BA:
- Branch comes from employee/auth claim; if missing, block with "liên hệ quản lý" instead of asking staff to pick coordinates or branches.
- Checklist is snapshotted at clock-in; later template edits must not change active or historical attendance.
- Checkout must be blocked server-side while any checklist item is not done.
- Duplicate clock-in for the same employee, tenant, and business date stays blocked server-side.

Senior Dev:
- Keep `attendance_records` as the workday parent and add private photo path plus checklist instance rows.
- Move Employee attendance writes through Server Actions using service role and RPC transactions; revoke direct self INSERT/UPDATE/DELETE paths.
- Use Storage upload first, then RPC; if RPC fails after upload, remove the uploaded object.
- Reuse Employee shell and one shared work-state helper so Home/Clock/Tasks do not drift.

QA/QC:
- Static and DB checks must cover revoked direct grants, private bucket, new checklist tables/RLS, and service-role-only RPC execution.
- Flow tests must cover no photo, wrong type/too-large photo, duplicate clock-in, checklist persistence, checkout guard, wrong/right code, no GPS, and fallback checklist.
- Required local gates remain `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
- `pnpm db:types` is required after the migration is applied to the type source schema.

## Unified Contract

Implement Employee Daily Work v1 with these non-negotiables:

1. `/employee` is the daily work home, not a portal. Self-service moves to nav/profile.
2. Clock-in requires one photo only. No GPS, no QR/code, no branch selector.
3. Clock-in creates the attendance row and checklist snapshot atomically through a Postgres RPC.
4. Checklist item state is binary: `Chưa làm` or `Xong`.
5. Checkout uses the existing branch attendance secret as "mã kết ca" via QR/manual code.
6. Checkout is blocked by Server Action/RPC until all checklist rows are done.
7. Direct Employee writes to `attendance_records` are revoked; Admin HR actions that still need writes use gated service-role actions.
8. Camera permission is allowed for Employee photo/QR while geolocation remains disabled.

