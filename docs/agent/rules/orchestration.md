# Orchestration And Cross-Runtime Review

Use this file only for subagents, multiple runtimes, arbitration, parallel
writers, or a real context-budget problem. Default to one agent inline.

## Smallest Lane

| Work shape                                                           | Lane                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| One fact, command, small edit, or reading files the author will edit | Inline                                               |
| Broad read-only orientation                                          | CodeGraph first; otherwise one read-only helper      |
| Independent audit or T3 risk challenge                               | Temporary read-only reviewers with bounded questions |
| Isolated implementation slice                                        | One executor only when it reduces context load       |
| Parallel implementation                                              | Separate worktrees and explicit file ownership       |

Do not delegate deterministic shell, git, build, lint, codegen, file moves, or
confirmed deletions. Ask reviewers for conclusions and evidence, not file dumps.

## Runtime Safety

- The current agent owns synthesis and remains accountable for repo rules.
- Review/challenge/consult lanes run in read-only, plan, ask, or sandbox mode.
  Never enable force, yolo, skip-permissions, or accept-edits for reviewers.
- Review prompts forbid DB/browser mutations and secret or personal-data output.
- A runtime without a registered production guard adapter stays read-only around
  production tools; see `references.md`.
- Parallel writers declare owned files, use isolated worktrees, and stop on
  overlap. Never let two agents mutate the same shared working tree.

## Handoff

Use English for agent-to-agent context:

```text
Mode: review | challenge | consult | execute
Task:
Diff/files:
Risk surface:
Rules loaded:
Question/pass criteria:
Evidence needed:
```

## Rubric-Based Subagent Review (LLM-as-a-Judge)

When delegating T3 risk challenges or automated PR reviews to subagents, the
reviewer MUST evaluate the diff against concrete domain rubrics rather than
giving subjective impressions. A review passes ONLY when all relevant criteria
are verified with exact file and line references.

### 1. Auth & RLS Rubric
- [ ] Server Actions validate every input via Zod schemas (`safeParse`/`parse`).
- [ ] `SECURITY DEFINER` functions revoke `EXECUTE` from `public`/`authenticated`
      unless wrapped in an authorized helper (e.g. `public.has_permission`).
- [ ] No raw PostgreSQL / Supabase errors (`error.message`) are leaked to the client.
- [ ] Tenant/branch scoping is verified on every query; no cross-tenant data leakage.

### 2. Money & Accounting Rubric
- [ ] Stored financial amounts use `numeric(...,2)` for Finance/VAT, and whole-VND
      for POS/menu/cash.
- [ ] No `Math.round()`, `Number()` precision loss, or display formatters acting
      as the financial source of truth.
- [ ] Stock movements and financial allocations execute in single atomic transactions.

### 3. UI, State & Interaction Rubric
- [ ] Interactive handlers call `await confirm(...)` **before** `startTransition(...)`.
- [ ] All four states (**Loading**, **Empty**, **Populated**, **Error**) are handled.
- [ ] Mobile touch targets meet $\ge 44\text{px}$ minimum; desktop density matches
      `page-archetypes.md`.
- [ ] Zero unescaped English copy in user-facing components; all strings follow
      `docs/ref/glossary.md`.

## Arbitration

When reviewers disagree:

1. Reproduce each claim with file/line, command output, screenshot, row, or a
   failing check.
2. Revisit only the contested point through the relevant `workflow.md` lens.
3. If evidence cannot settle a material T3 choice, ask the owner with both
   positions stated plainly.
4. Record the decision in the PR/task summary; promote only durable rules.

## Context And Learning

- Keep prompts small and load only relevant regression/lesson rows.
- Durable explanation belongs in its owning rule/module/ref/spec; recurring
  deterministic failures belong in a guard/test; transient notes stay in PR/task
  history.
- No standing team, recurring mission table, parallel task board, private memory
  authority, or second reviewer without a concrete risk question.

