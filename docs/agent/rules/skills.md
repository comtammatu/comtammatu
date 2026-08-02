# Skill And Tool Routing

Project sources decide policy; skills and tools only help execute it.

## Authority

1. `AGENTS.md`
2. Applicable `docs/agent/rules/*`
3. Sources mapped by `references.md`
4. External skills, plugins, MCP/browser tooling
5. Agent memory or local notes

Load the smallest capability that closes a known gap. The tracked
`.agents/skills` bundle is verified by `agent:start`; external/global skills
cannot replace or modify repository authority.

## Routing

| Task signal | Primary capability | Add only when |
| --- | --- | --- |
| App Router, RSC, Server Action | `next-best-practices` | The framework boundary is in scope |
| Shared component/accessibility | `building-components` | A reusable component contract changes |
| Supabase, migration, RLS, RPC | `supabase` | Target is verified |
| Query/index/lock performance | `supabase-postgres-best-practices` | A measured database hypothesis exists |
| Runtime UI/workflow proof | `playwright` | Source inspection cannot prove behavior |
| Monorepo pipeline/package graph | `turborepo` | More than one package boundary changes |
| Registry/preset work | `shadcn` | Registry configuration is the actual task |

Do not stack overlapping UI skills or add a specialist to routine work. Dormant
upgrade, cache, AI-interface, and external-design capabilities require an
explicit task signal.

## Safety

- Database tooling never overrides `database.md` target and mutation rights.
- Production browser sessions are read-only unless the owner delegates the exact
  mutation. Verify the backend/ref before runtime QA.
- Redact secrets, tokens, customer/employee data, and sensitive screenshots.
- Legal, tax, labor, payroll, and HĐĐT values start at
  `docs/ref/legal-framework-2026.md` and current official sources; stop when
  source, code, and law disagree.
- External UI advice follows the UI Advisor Gate in `ui.md` and cannot replace
  the Má Tư Design System.
- Unregistered runtimes stay read-only/plan/ask/sandbox. Never use force,
  skip-permissions, or accept-edits for a review lane.
- Subagent boundaries, non-overlap, and arbitration live in
  `orchestration.md`.
