---
description: Run the full verification checklist from docs/agent/rules/workflow.md → Verification
---

Execute `docs/agent/rules/workflow.md` → Verification, steps 1–7 in order, for
the current change. Constraints that have bitten before (`tasks/lessons.md`
items 3–4): a background-completion notification's exit code is not proof —
read the gate's own output; a cached turbo result proves inputs unchanged, not
that the gate passed — run gates fresh. Finish with the tier attestation
(step 4) and the stated learning-or-none (step 7).
