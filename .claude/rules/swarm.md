# Claude Swarm — Multi-Agent Coordination

## Overview

This project uses **claude-swarm** for multi-agent collaboration. Each Claude Code terminal is one agent with a specific role. Agents coordinate via rooms, messages, tasks, and scratchpad.

**Core problem solved:** Claude Code has no event-driven messaging — agents can't "listen" for messages. Every coordination point must be explicit: poll → act → notify.

## Agent Roles

### Orchestrator (Room Owner)

- **Scope:** Project root (`/comtammatu`)
- **Responsibilities:** Plan sessions, delegate tasks, review results, merge decisions
- **Creates room:** `comtammatu-{module}-s{N}`

### Database Agent

- **Scope:** `supabase/`, `packages/database/`
- **Responsibilities:** Write migrations, RLS policies, SQL functions, regenerate types
- **Must follow:** `/db-migrate` skill, GRANT + RLS checklist, `pnpm db:types` after migration
- **Scratchpad keys:** `schema-changes`

### Backend Agent

- **Scope:** `apps/web/app/`, `apps/web/proxy.ts`, `packages/shared/`, `packages/security/`
- **Responsibilities:** Server Actions, API routes, proxy logic, auth/ACL
- **Must follow:** `/new-action`, `/new-page` skills, Zod validation, safe error responses
- **Scratchpad keys:** `action-status`

### Frontend Agent

- **Scope:** `packages/ui/`, `apps/web/app/**/page.tsx`, client components
- **Responsibilities:** UI components, pages, forms, client-side state
- **Must follow:** Import from `@comtammatu/database/supabase/client` NEVER barrel
- **Scratchpad keys:** `ui-changes`

---

## Coordination Protocol

### Problem

Agents forget to:

1. Poll for messages → miss "you're unblocked" signals
2. Notify downstream agents → next agent waits forever
3. Report status to orchestrator → orchestrator can't track progress

### Solution: Explicit Dependency Chain + Mandatory Handoff

Every agent must follow a **3-phase loop**: POLL → WORK → HANDOFF.

#### Dependency Graph (hardcoded)

```
orchestrator creates room + tasks
       │
       ▼
   database ──── HANDOFF ────► backend ──── HANDOFF ────► frontend
       │                          │                          │
       └── REPORT ──► orchestrator ◄── REPORT ──┘◄── REPORT ─┘
```

#### Scratchpad as Source of Truth

Instead of relying on messages (which can be missed), use **scratchpad keys** as reliable state:

```
pipeline-status     # JSON: {"database":"done","backend":"working","frontend":"blocked"}
schema-changes      # Database agent writes: what tables/columns/RLS changed
action-status       # Backend agent writes: what actions/routes created
ui-changes          # Frontend agent writes: what pages/components built
plan                # Orchestrator writes: task contract
```

**Rule: Before starting work, check `pipeline-status` — not messages.**

#### Mandatory Handoff Protocol

When an agent finishes work, it MUST do ALL of these (not just broadcast):

```
# 1. Update scratchpad with what you did
scratchpad_set(room, "{your-key}", "summary of changes")

# 2. Update pipeline-status
# Read current → update your status → write back
current = scratchpad_get(room, "pipeline-status")
updated = { ...current, "{your-role}": "done" }
scratchpad_set(room, "pipeline-status", updated)

# 3. Update your task
update_task(task_id, status: "review", result: "summary")

# 4. Direct message to EACH downstream agent (not broadcast)
send_message(next_agent_id, "UNBLOCKED: {your-role} done. Check scratchpad '{your-key}' for details.")

# 5. Direct message to orchestrator
send_message(orchestrator_id, "DONE: {task summary}")

# 6. Update status
set_status("idle")
```

**Why direct `send_message` instead of `broadcast`?** Broadcast is fire-and-forget. Direct messages are targeted — the receiving agent knows the message is specifically for them.

#### Mandatory Poll Protocol

Agents waiting for dependencies MUST poll on a loop:

```
# Poll loop (every time user sends empty message or agent checks)
1. check_messages()                              # Any direct messages?
2. scratchpad_get(room, "pipeline-status")       # Is my dependency done?
3. If dependency done → start work
4. If not → set_status("waiting") → tell user "Waiting for {dependency}"
```

**Orchestrator poll loop (runs via /loop or manual):**

```
1. check_messages()                              # Any agent reports?
2. list_tasks(room)                              # Check all task statuses
3. scratchpad_get(room, "pipeline-status")       # Pipeline state
4. If all "review" → start reviewing
5. If any "blocked" → investigate + unblock
6. If timeout (>10 min no progress) → send_message to stuck agent
```

---

## Room Conventions

### Naming

```
comtammatu-m2-s1              # Module 2, Session 1
comtammatu-m2-s2              # Module 2, Session 2
comtammatu-hotfix-{issue}     # Urgent fix coordination
```

### Task Status Flow

```
pending → in_progress → review → done
                      → blocked → (orchestrator unblocks) → in_progress
```

---

## Rules

1. **Scratchpad over messages** — `pipeline-status` is the source of truth, not message history
2. **Direct message, not broadcast** — handoff uses `send_message` to specific agents
3. **Poll before work** — always `check_messages()` + `scratchpad_get("pipeline-status")` before starting
4. **No silent completion** — finishing without handoff = bug. All 6 handoff steps required
5. **Don't cross scope boundaries** — Database Agent doesn't write UI, Frontend Agent doesn't write migrations
6. **Verify independently** — each agent runs `/verify` on their own changes before handoff
7. **Orchestrator merges** — only Orchestrator marks the overall session as complete
8. **Follow existing CLAUDE.md** — all swarm rules are additive, never override project constraints

---

## Session-Start Prompts

Copy-paste the appropriate prompt when starting a new Claude Code terminal for each role.

### Orchestrator (Terminal 1)

```
You are the ORCHESTRATOR for this swarm session.

SETUP:
1. set_name("orchestrator")
2. set_status("busy")
3. Read docs/plan/roadmap.md → identify current module + session
4. create_room("comtammatu-{module}-s{N}")
5. Write Task Contract → scratchpad_set(room, "plan", contract)
6. scratchpad_set(room, "pipeline-status", '{"database":"pending","backend":"blocked","frontend":"blocked"}')
7. create_task for each agent (assigned_to: "database" | "backend" | "frontend")
8. set_status("waiting")

Tell user: "Room created: {room_id}. Start database/backend/frontend agents in other terminals."

COORDINATION LOOP (run every few minutes or when user prompts):
1. check_messages()
2. list_tasks(room)
3. scratchpad_get(room, "pipeline-status")
4. Log status to user: "Pipeline: DB={status}, Backend={status}, Frontend={status}"

WHEN database reports done:
1. scratchpad_get(room, "schema-changes") → review
2. list_peers(scope: "room") → find backend peer ID
3. send_message(backend_id, "UNBLOCKED: Database done. Read scratchpad 'schema-changes'. Start your tasks.")
4. Update pipeline-status: backend → "pending"

WHEN backend reports done:
1. scratchpad_get(room, "action-status") → review
2. list_peers(scope: "room") → find frontend peer ID
3. send_message(frontend_id, "UNBLOCKED: Backend done. Read scratchpad 'action-status'. Start your tasks.")
4. Update pipeline-status: frontend → "pending"

WHEN all tasks "review":
1. Review all scratchpad keys
2. Run /verify on full project
3. update_task all → "done"
4. broadcast("Session complete. All tasks done.")
5. Checkpoint commit
```

### Database Agent (Terminal 2)

```
You are the DATABASE AGENT. Scope: supabase/ and packages/database/ ONLY.

SETUP:
1. set_name("database")
2. set_status("idle")
3. list_rooms() → join_room("{room_id}")
4. scratchpad_get(room, "plan") → understand the task
5. list_tasks(room) → find tasks assigned to "database"

WORK:
1. update_task(task_id, status: "in_progress")
2. set_status("busy")
3. Do work (migrations, RLS, GRANT, types)
4. Run /verify on your changes

HANDOFF (ALL steps mandatory — do not skip any):
1. scratchpad_set(room, "schema-changes", "detailed summary: tables, columns, RLS, GRANTs")
2. scratchpad_get(room, "pipeline-status") → update database to "done" → scratchpad_set back
3. update_task(task_id, status: "review", result: "summary")
4. list_peers(scope: "room") → find orchestrator peer ID
5. send_message(orchestrator_id, "DONE: Database task complete. Tables: X, Y, Z. Check scratchpad 'schema-changes'.")
6. set_status("idle")
7. Wait for orchestrator review. Poll: check_messages() for feedback.
```

### Backend Agent (Terminal 3)

```
You are the BACKEND AGENT. Scope: apps/web/app/, proxy, shared, security.

SETUP:
1. set_name("backend")
2. set_status("waiting")
3. list_rooms() → join_room("{room_id}")
4. scratchpad_get(room, "plan") → understand the task
5. list_tasks(room) → find tasks assigned to "backend"

WAIT LOOP (repeat until unblocked):
1. check_messages() → look for "UNBLOCKED" from orchestrator
2. scratchpad_get(room, "pipeline-status") → is database "done"?
3. If not done → tell user "Waiting for database agent..." → wait for user to prompt again
4. If done → proceed to WORK

WORK:
1. scratchpad_get(room, "schema-changes") → understand new schema
2. update_task(task_id, status: "in_progress")
3. set_status("busy")
4. Do work (Server Actions, routes, ACL)
5. Run /verify on your changes

HANDOFF (ALL steps mandatory — do not skip any):
1. scratchpad_set(room, "action-status", "detailed summary: actions, routes, types")
2. scratchpad_get(room, "pipeline-status") → update backend to "done" → scratchpad_set back
3. update_task(task_id, status: "review", result: "summary")
4. list_peers(scope: "room") → find orchestrator peer ID
5. send_message(orchestrator_id, "DONE: Backend task complete. Actions: X, Y. Check scratchpad 'action-status'.")
6. set_status("idle")
7. Wait for orchestrator review. Poll: check_messages() for feedback.
```

### Frontend Agent (Terminal 4)

```
You are the FRONTEND AGENT. Scope: packages/ui/, apps/web/app/ (pages + client components).

SETUP:
1. set_name("frontend")
2. set_status("waiting")
3. list_rooms() → join_room("{room_id}")
4. scratchpad_get(room, "plan") → understand the task
5. list_tasks(room) → find tasks assigned to "frontend"

WAIT LOOP (repeat until unblocked):
1. check_messages() → look for "UNBLOCKED" from orchestrator
2. scratchpad_get(room, "pipeline-status") → is backend "done"?
3. If not done → tell user "Waiting for backend agent..." → wait for user to prompt again
4. If done → proceed to WORK

WORK:
1. scratchpad_get(room, "schema-changes") + scratchpad_get(room, "action-status")
2. update_task(task_id, status: "in_progress")
3. set_status("busy")
4. Do work (UI components, pages, forms)
5. Run /verify on your changes

HANDOFF (ALL steps mandatory — do not skip any):
1. scratchpad_set(room, "ui-changes", "detailed summary: pages, components")
2. scratchpad_get(room, "pipeline-status") → update frontend to "done" → scratchpad_set back
3. update_task(task_id, status: "review", result: "summary")
4. list_peers(scope: "room") → find orchestrator peer ID
5. send_message(orchestrator_id, "DONE: Frontend task complete. Pages: X, Y. Check scratchpad 'ui-changes'.")
6. set_status("idle")
7. Wait for orchestrator review. Poll: check_messages() for feedback.
```

---

## Quick Start (4 terminals)

```bash
# Terminal 1 — Orchestrator
cd ~/Downloads/Personal/comtammatu && claude
# Paste orchestrator prompt → it creates room and tells you the room_id

# Terminal 2 — Database (start after orchestrator gives room_id)
cd ~/Downloads/Personal/comtammatu && claude
# Paste database agent prompt (replace {room_id})

# Terminal 3 — Backend (start anytime, will wait for DB)
cd ~/Downloads/Personal/comtammatu && claude
# Paste backend agent prompt (replace {room_id})

# Terminal 4 — Frontend (start anytime, will wait for backend)
cd ~/Downloads/Personal/comtammatu && claude
# Paste frontend agent prompt (replace {room_id})
```

---

## Troubleshooting

### Agent stuck waiting

Orchestrator should:

1. `list_tasks(room)` → check which agent is stuck
2. `scratchpad_get(room, "pipeline-status")` → verify dependency state
3. If dependency is actually done but agent didn't get message:
   - `list_peers(scope: "room")` → find stuck agent's peer ID
   - `send_message(agent_id, "UNBLOCKED: {dependency} is done. Check scratchpad. Start work.")`

### Agent finished but didn't handoff

Orchestrator should:

1. Check `git diff` or file changes to verify work is done
2. Manually update scratchpad: `scratchpad_set(room, "pipeline-status", corrected_state)`
3. Send unblock message to next agent

### Pipeline status out of sync

Orchestrator is the authority. If `pipeline-status` is wrong:

1. `list_tasks(room)` → get actual task states
2. `scratchpad_set(room, "pipeline-status", corrected_state)` → fix it
3. Notify affected agents
