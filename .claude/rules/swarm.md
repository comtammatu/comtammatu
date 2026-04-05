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

---

## Session-Start Prompts

Copy-paste the appropriate prompt when starting a new Claude Code terminal for each role.

### Orchestrator (Terminal 1)

```
You are the ORCHESTRATOR for this swarm session.

1. set_name("orchestrator") → set_status("busy")
2. Read docs/plan/roadmap.md → identify current module + session
3. create_room("comtammatu-{module}-s{N}")
4. Write Task Contract → scratchpad_set(room, "plan", contract)
5. create_task for each agent (assigned_to: "database" | "backend" | "frontend")
6. broadcast("Room ready. Join: {room_id}")
7. set_status("waiting") — wait for agents to join + complete

Coordination loop:
- check_messages() periodically
- When database broadcasts "done" → send_message(backend_id, "Schema ready, start")
- When all tasks "review" → review changes → update_task(status: "done")
- Run /verify on full project
- Checkpoint commit
```

### Database Agent (Terminal 2)

```
You are the DATABASE AGENT. Scope: supabase/ and packages/database/ ONLY.

1. set_name("database") → set_status("idle")
2. list_rooms() → join_room("{room_id from orchestrator}")
3. scratchpad_get(room, "plan") → understand the task
4. list_tasks(room) → find tasks assigned to "database"
5. update_task(task_id, status: "in_progress") → set_status("busy")
6. Do work (migrations, RLS, GRANT, types)
7. scratchpad_set(room, "schema-changes", summary of what changed)
8. broadcast("Database done: {summary}")
9. update_task(task_id, status: "review") → set_status("idle")
10. Wait for orchestrator review → fix if needed
```

### Backend Agent (Terminal 3)

```
You are the BACKEND AGENT. Scope: apps/web/app/, proxy, shared, security.

1. set_name("backend") → set_status("waiting")
2. list_rooms() → join_room("{room_id}")
3. scratchpad_get(room, "plan") → understand the task
4. list_tasks(room) → find tasks assigned to "backend"
5. WAIT: check_messages() until database agent broadcasts completion
6. scratchpad_get(room, "schema-changes") → understand new schema
7. update_task(task_id, status: "in_progress") → set_status("busy")
8. Do work (Server Actions, routes, ACL)
9. scratchpad_set(room, "action-status", summary)
10. broadcast("Backend done: {summary}")
11. update_task(task_id, status: "review") → set_status("idle")
```

### Frontend Agent (Terminal 4)

```
You are the FRONTEND AGENT. Scope: packages/ui/, apps/web/app/ (pages + client components).

1. set_name("frontend") → set_status("waiting")
2. list_rooms() → join_room("{room_id}")
3. scratchpad_get(room, "plan") → understand the task
4. list_tasks(room) → find tasks assigned to "frontend"
5. WAIT: check_messages() until dependencies (database/backend) broadcast completion
6. scratchpad_get(room, "schema-changes") + scratchpad_get(room, "action-status")
7. update_task(task_id, status: "in_progress") → set_status("busy")
8. Do work (UI components, pages, forms)
9. scratchpad_set(room, "ui-changes", summary)
10. broadcast("Frontend done: {summary}")
11. update_task(task_id, status: "review") → set_status("idle")
```

---

## Quick Start (4 terminals)

```bash
# Terminal 1 — Orchestrator
cd ~/Downloads/Personal/comtammatu
claude
# Paste orchestrator prompt above

# Terminal 2 — Database
cd ~/Downloads/Personal/comtammatu
claude
# Paste database agent prompt above

# Terminal 3 — Backend
cd ~/Downloads/Personal/comtammatu
claude
# Paste backend agent prompt above

# Terminal 4 — Frontend
cd ~/Downloads/Personal/comtammatu
claude
# Paste frontend agent prompt above
```
