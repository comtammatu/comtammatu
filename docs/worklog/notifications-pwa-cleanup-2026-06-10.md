# Notification PWA Cleanup — 2026-06-10

Skill plan: repo rules = engineering + database + ui + workflow + references + toast-notification spec; external skills = supabase, supabase-postgres-best-practices, shadcn; runtime tools = local source grep, SQL migration/type inspection, focused static tests, full gates, and browser smoke when auth/env allows.

PM: Scope is to remove retired customer-response and customer-database product surfaces from active source and make Notification a durable channel for Cổng nhân viên, in-app inbox, and installed PWA devices. Acceptance means no active route/nav/ACL/copy points to those retired surfaces, `/notifications` remains the durable inbox, Cổng nhân viên exposes the inbox and push opt-in, and PWA push has a standards-based subscription + dispatch path for Android and iOS Home Screen web apps.

BA: Toast stays for immediate local action feedback. Durable notifications are for handoff, approval, exception, SLA, or cross-role work. PWA notification permission must be initiated by a user action. iOS/iPadOS delivery requires a Home Screen web app on a supported OS; unsupported browsers should fail closed with clear app copy, not hidden crashes.

Senior Dev: Add a tenant/user-scoped push subscription table with RLS, add Server Actions for VAPID public key/readiness/register/unregister/test send, add service worker push/click handlers, add a cron dispatcher that sends newly-created visible notifications to active subscriptions with service-role lookup, and wire a compact shadcn-compliant control into `/notifications` plus Employee header/home. Cleanup must respect the dirty tree and not resurrect deleted Feedback files.

QA/QC: Cover static regressions for no active route/auth/copy references to the retired surfaces, notification Server Actions and service worker push handlers, and run targeted tests plus `pnpm typecheck && pnpm lint && pnpm build`. Browser/PWA smoke should verify `/notifications` renders the opt-in control; real OS push delivery depends on HTTPS, VAPID env, and real Android/iOS devices.
