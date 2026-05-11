# Supabase User Migration Runbook

Run manually by the owner when cutting a new release that requires user data sync.

## When to run
- First production deployment of the Go backend
- When new Supabase auth users need to be imported into public.users

## Prerequisites
- .env populated with SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY
- DATABASE_URL pointing to the target database
- curl and jq installed

## Steps
1. Review the script: `cat backend/scripts/migrate-supabase-users.sh`
2. Dry run: set DATABASE_URL to a staging/dev DB first
3. Run: `cd backend && ./scripts/migrate-supabase-users.sh`
4. Verify: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM public.users"`
5. The script is idempotent — safe to re-run (ON CONFLICT DO NOTHING)

## Rollback
No rollback needed — the script only inserts, never deletes or updates.
