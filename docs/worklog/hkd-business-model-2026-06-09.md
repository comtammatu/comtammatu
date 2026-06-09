# HKD Business Model Update — 2026-06-09

## Scope

Convert current project authority from CTCP/JSC framing to **Hộ kinh doanh Cơm
Tấm Má Tư** for docs, rules, glossary, and memory. Historical SQL archives
remain historical unless a future migration needs to rewrite seed/runtime data.
HĐĐT runtime seller identity is deliberately limited to the verified Vinvoice
contract; no guessed seller env aliases or `sellerInfo` override are introduced.

## Skill plan

Skill plan: repo rules = engineering + skills + workflow + references; external
skills = none; runtime tools = CLI + web/legal/Vinvoice verification; skipped =
no Browser/DB because this is docs plus HĐĐT config-contract cleanup.

## T3 debate

PM: scope = update current authority and prevent future CTCP drift; acceptance =
entrypoint/docs/glossary/HĐĐT/Finance/HR/memory say HKD, and HĐĐT docs do not
claim unsupported Vinvoice fields; priority = high because seller identity
appears on invoices.

BA: rules = HKD is not CTCP, tenant is the HKD record, representative is
registered HKD owner/representative, owner_user_id is auth identity; edge cases =
historical docs/SQL archives may mention CTCP as history, invoice seller identity
must come from the exact Viettel/CQT registration; data flow = `COMPANY_TAX_CODE`
feeds `supplierTaxCode`, while `sellerInfo` is not sent by current runtime.

Senior Dev: approach = keep data model and provider state machine unchanged,
keep Viettel provider registration on the existing `COMPANY_TAX_CODE`, remove
the unverified seller helper/env aliases, and update docs; files = docs/ref,
docs/modules, docs/agent/rules, tasks, apps/web finance/HĐĐT config touchpoints;
risk = low code blast radius but high legal significance, so no seller override
without Vinvoice contract evidence.

QA/QC: tests = run text sweeps for CTCP/HKD drift and full repo gates where
feasible; regressions = issued/replacement/daily-summary provider calls must
still use existing `COMPANY_TAX_CODE` as `supplierTaxCode`; verify no provider
flow/state transition changes.

## Unified contract

- Default legal model is HKD.
- HĐĐT runtime keeps the verified Vinvoice contract: `COMPANY_TAX_CODE` is the
  `supplierTaxCode`; `sellerInfo` is not sent and must not be guessed.
- Any future `sellerInfo` override requires the actual Vinvoice API document and
  the HKD's registered seller profile/template values.
- Do not rewrite archived migration history in this pass.
