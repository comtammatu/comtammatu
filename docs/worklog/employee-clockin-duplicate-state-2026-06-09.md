# Employee clock-in duplicate state hotfix

Date: 2026-06-09

## T2 Notes

Skill plan: repo rules = engineering + database + workflow; external skills = supabase; runtime tools = local source + targeted tests; skipped = browser smoke unless an authenticated Employee session is available.

PM: scope = make repeat clock-in attempts recover into the current Employee state instead of showing a red failure; acceptance = no second attendance row is created and the user lands on the right daily-work step.

BA: rules = duplicate clock-in for the same employee, tenant, and VN business date remains blocked server-side; existing active, pending-approval, and completed records are display states, not new clock-ins.

Dev: approach = keep the duplicate guard before photo upload/RPC insert, return an idempotent success payload for existing records, and let the client navigate to the supplied recovery path.

QA: tests = static coverage for duplicate recovery payload/client routing plus existing Employee Daily Work static assertions; full gates still required before marking broader implementation complete.
