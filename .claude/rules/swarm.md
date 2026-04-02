# Claude Swarm — Multi-Agent Coordination

## Overview

This project uses **claude-swarm** for multi-agent collaboration. When working in a swarm, each Claude Code instance has a specific role and communicates via rooms, messages, and shared scratchpad.

## Agent Roles

### Orchestrator (Room Owner)

- **Scope:** Project root (`/comtammatu`)
- **Responsibilities:** Plan sessions, delegate tasks, review results, merge decisions
- **Status convention:** `idle` when waiting, `reviewing` when checking agent output
- **Creates room:** `comtammatu-sprint-{N}` or `comtammatu-{feature}`

### Database Agent

- **Scope:** `supabase/`, `packages/database/`
- **Responsibilities:** Write migrations, RLS policies, SQL functions, regenerate types
- **Must follow:** `/db-migrate` skill, GRANT + RLS checklist, `pnpm db:types` after migration
- **Scratchpad keys:** `schema-changes`, `migration-status`, `rls-policies`

### Backend Agent

- **Scope:** `apps/web/app/`, `apps/web/proxy.ts`, `packages/shared/`, `packages/security/`
- **Responsibilities:** Server Actions, API routes, proxy logic, auth/ACL
- **Must follow:** `/new-action`, `/new-page` skills, Zod validation, safe error responses
- **Scratchpad keys:** `action-status`, `api-changes`, `acl-updates`

### Frontend Agent

- **Scope:** `packages/ui/`, `apps/web/app/**/page.tsx`, client components
- **Responsibilities:** UI components, pages, forms, client-side state
- **Must follow:** Import from `@comtammatu/database/supabase/client` NEVER barrel
- **Scratchpad keys:** `ui-changes`, `component-status`

## Room Conventions

### Naming

```
comtammatu-sprint-{N}         # Sprint-level coordination
comtammatu-{feature-name}     # Feature-specific room
comtammatu-hotfix-{issue}     # Urgent fix coordination
```

### Scratchpad Keys (Shared Memory)

```
plan              # Current task plan / task contract
decisions         # Architecture decisions made in this room
blockers          # Current blockers needing resolution
schema-changes    # DB schema changes (Database Agent writes)
action-status     # Server Action progress (Backend Agent writes)
ui-changes        # UI changes (Frontend Agent writes)
verify-status     # Last /verify result (any agent)
review-notes      # Code review findings (Orchestrator writes)
```

### Task Status Flow

```
pending → in_progress → review → done
                      → blocked → in_progress (after unblock)
```

## Workflow

### 1. Orchestrator starts session

```
1. create_room("comtammatu-sprint-1-s5")
2. scratchpad_set(room, "plan", task_contract)
3. create_task(room, "Write migration for orders table", assigned: "database")
4. create_task(room, "Create order Server Actions", assigned: "backend")
5. create_task(room, "Build order form UI", assigned: "frontend")
```

### 2. Agents join & work

```
1. join_room("comtammatu-sprint-1-s5")
2. scratchpad_get(room, "plan")           # Read the plan
3. list_tasks(room)                        # Find assigned tasks
4. update_task(task_id, status: "in_progress")
5. ... do work ...
6. scratchpad_set(room, "schema-changes", summary)
7. broadcast(room, "Migration done, types regenerated")
8. update_task(task_id, status: "review")
```

### 3. Orchestrator reviews & coordinates

```
1. check_messages()                        # See agent updates
2. scratchpad_get(room, "schema-changes")  # Review changes
3. send_message(backend_id, "DB ready, start actions")
4. update_task(task_id, status: "done")
```

## Rules

1. **Always check room scratchpad** before starting work — another agent may have updated context
2. **Broadcast completion** — when you finish a task, broadcast to room so dependent agents can proceed
3. **Don't cross scope boundaries** — Database Agent doesn't write UI, Frontend Agent doesn't write migrations
4. **Scratchpad for decisions** — any decision that affects other agents goes in scratchpad, not just messages
5. **Verify independently** — each agent runs `/verify` on their own changes before marking done
6. **Orchestrator merges** — only Orchestrator marks the overall session as complete
7. **Follow existing CLAUDE.md** — all swarm rules are additive, never override project constraints
