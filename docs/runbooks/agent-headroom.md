# Headroom Agent Workflow

Use Headroom only as a local context-compression layer for agent sessions. It is
not part of the app runtime and must not become a repo-pinned dependency.

## When To Use

- Long sessions with large tool outputs: `pnpm verify`, build logs, test logs,
  Supabase SELECT dumps, repo audits, or T3 review handoffs.
- Repeated cross-runtime work where Claude and Codex share long context.
- Output-token shaping experiments after the input-compression path is already
  working.

Do not use it as proof. If a decision depends on an exact log line, SQL result,
or source file, re-open the original output or rerun the command.

## Local Setup

```bash
python3 -m pip install --user "headroom-ai[all]"
export HEADROOM_TELEMETRY=off
headroom doctor
headroom wrap codex
```

For Claude Code on the same machine:

```bash
export HEADROOM_TELEMETRY=off
headroom wrap claude
```

Undo local wrapping when testing baseline behavior:

```bash
headroom unwrap codex
headroom unwrap claude
```

## Measure Before Keeping

Run one normal log-heavy workflow through Headroom:

```bash
pnpm verify
headroom perf
headroom dashboard
```

Keep it for this repo only if the session shows meaningful savings on the work
we actually repeat. A useful threshold is 30%+ input reduction on log/tool-heavy
sessions with no missed critical detail. If savings are small or debugging feels
less trustworthy, unwrap it.

## Optional Output Shaping

```bash
export HEADROOM_OUTPUT_SHAPER=1
headroom wrap codex
```

Use this only after the normal proxy path is stable. Disable it for review,
incident, migration, money, or security work if terse output hides needed
evidence.

## Learning Guardrail

`headroom learn` may propose useful project-specific corrections, but this repo
does not let tools rewrite tracked rule files automatically.

```bash
headroom learn --project .
```

Keep this as dry-run. If a recommendation is real and durable, manually promote
it to the existing source of truth:

- deterministic failure pattern -> `tasks/regressions.md` or a lint guard
- reusable lesson -> `tasks/lessons.md`
- stable routing/agent policy -> `docs/agent/rules/skills.md`

Do not commit Headroom-generated `AGENTS.md`, `CLAUDE.md`, local memory, cache,
or session files.
