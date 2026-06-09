# Migration Hotfix — 2026-06-09

## T3 Contract

Skill plan: repo rules = engineering + database + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CLI static checks; skipped = live Supabase apply because CLI is unavailable in this workspace.

PM: scope is limited to making the new migration chain apply safely and preserving branch/KDS auth behavior. Done means the active migration files no longer have the identified apply/runtime hazards.

BA: retired intermediate scope users are disabled and moved to office without keeping area scope in claims. Branch access remains owner/super-manager tenant-wide and branch staff branch-scoped.

Senior Dev: clear retired profile area state before role remap can trip the old trigger, rewrite `can_access_branch` before dropping area helpers/tables, and make invalid shift ids fail explicitly.

QA/QC: run migration diff hygiene plus targeted static tests for employee daily work, intermediate scope, HR bulk scheduling, and POS discount coverage.
