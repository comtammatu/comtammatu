# Active Planning Index

This folder holds active decisions, ADRs, and baseline-prep investigations.
It is not the place for shipped roadmap history or superseded sprint plans.

## Current Authority

- [decisions.md](decisions.md): active architecture decision log.
- [adr/0005-owner-identity-dual-source.md](adr/0005-owner-identity-dual-source.md): active ADR.
- [new-project-upgrade-baseline.md](new-project-upgrade-baseline.md): current baseline-prep package for a future upgraded project.

## Baseline Prep Artifacts

- [route-module-acl-inventory.md](route-module-acl-inventory.md): route, proxy, module ACL, and action guard inventory.
- [data-audit-classification.md](data-audit-classification.md): source-only table, storage, cron, and provider classification.
- [live-migration-drift-reconciliation.md](live-migration-drift-reconciliation.md): read-only local-vs-live migration drift report.
- [live-schema-first-baseline-extraction.md](live-schema-first-baseline-extraction.md): live-schema-first extraction contract.
- [supabase-local-baseline-replay.md](supabase-local-baseline-replay.md): local replay evidence and `local-chain-first` verdict.
- [supabase-managed-surfaces-baseline.md](supabase-managed-surfaces-baseline.md): managed Supabase surface manifest.
- [supabase-managed-surfaces-install-bundle.sql](supabase-managed-surfaces-install-bundle.sql): install SQL/config bundle for managed surfaces.
- [greenfield-schema-legacy-audit.md](greenfield-schema-legacy-audit.md): greenfield restore and schema hardening audit.
- [inventory-platform-replacement-plan.md](inventory-platform-replacement-plan.md): Inventory replacement investigation/plan using `matu-platform` as a reference and data source, not as a live runtime backend.

## Historical Material

- Completed roadmap and sprint history live under [../archive/plan/](../archive/plan/).
- Suspended greenfield rebuild material lives under [../archive/plan/system-rebuild/](../archive/plan/system-rebuild/).
- Do not apply archive instructions as active work unless the owner explicitly reactivates them.
