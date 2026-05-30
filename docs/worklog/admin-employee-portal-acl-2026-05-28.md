# Admin / Cổng nhân viên ACL - 2026-05-28

## T3 Implementation Contract

Scope: admin-level roles must not enter Cổng nhân viên. In this codebase that means `owner` and `super_manager` use the Admin route as their landing and fallback path; `/employee/*` remains a self-service and operational handoff surface for non-admin staff.

PM: Build the smallest route-control change: block `owner` and `super_manager` from `employee`, keep all other staff defaults unchanged, and avoid turning `/employee` into an admin workspace.

BA: Business rule is role-based at module ACL level. Direct admin visits to `/employee/*` should land on Admin instead of showing the employee portal. Return-to/login flows must not preserve `/employee/*` for admin roles. Non-admin staff with employee access continue unchanged.

Senior Dev: Change the single ACL source in `packages/shared/src/auth/module-acl.ts`, then align proxy fallback behavior in `apps/web/proxy.ts`. Remove admin-shell navigation into `/employee` through the same `canAccess(role, "employee")` check. Update auth docs and shared auth tests.

QA/QC: Verify `canAccess(owner|super_manager, "employee")` is false, non-admin staff remain true, admin `returnTo=/employee` falls back to Admin, and existing route-resolution tests still pass. Completion gate remains `pnpm typecheck && pnpm lint && pnpm build`.
