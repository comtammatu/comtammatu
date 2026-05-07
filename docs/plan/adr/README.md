# Architecture Decision Records

ADRs capture decisions that shape the product, schema, operations, and migration path for the Cơm Tấm Má Tư rebuild.

## Status Values

- `proposed`: drafted, not yet approved by owner.
- `accepted`: owner/tech lead approved and implementation can follow it.
- `superseded`: replaced by another ADR (link forward).
- `deferred`: acknowledged but postponed to a later phase.

## ADR Set

| # | Title | Status | Source |
|---|---|---|---|
| 0001 | [Auth Migration](0001-auth-migration.md) | proposed | comtammatu-original |
| 0002 | [Database Provider](0002-database-provider.md) | accepted | comtammatu-original |
| 0003 | [Cutover Rollback](0003-cutover-rollback.md) | accepted | comtammatu-original |
| 0004 | [Position Code Normalization](0004-position-code-normalization.md) | accepted | comtammatu-original |
| 0005 | [Owner Identity Dual Source](0005-owner-identity-dual-source.md) | deferred | comtammatu-original |
| 0006 | [Frontline Flutter Client](0006-frontline-flutter-client.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0007 | [Branch Hub Architecture](0007-branch-hub-architecture.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0008 | [Handheld Failover Mode](0008-handheld-failover-mode.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0009 | [Background Jobs Runtime](0009-background-jobs-runtime.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0010 | [Flutter Implementation Choices](0010-flutter-implementation-choices.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0011 | [MFA And Recovery](0011-mfa-and-recovery.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0012 | [Tenant Configuration Separation](0012-tenant-configuration-separation.md) | proposed | adopted from matu-superapp 2026-05-07 |
| 0013 | [Rate Limit Fallback Policy](0013-rate-limit-fallback-policy.md) | proposed | renumbered from matu-superapp ADR-0003 |
| 0014 | [Realtime Channel Lifecycle](0014-realtime-channel-lifecycle.md) | proposed | renumbered from matu-superapp ADR-0004 |

## Folded Decisions

Two matu-superapp ADRs were folded into existing comtammatu canonical docs rather than carried as standalone ADRs:

- matu-superapp ADR-0001 (`green-baseline-squash-strategy`) → folded into [02-GREEN-BASELINE.md](../system-rebuild/02-GREEN-BASELINE.md) §Squash Strategy
- matu-superapp ADR-0005 (`modern-stack-baseline`) → folded into [CLAUDE.md](../../../CLAUDE.md) Stack section

## Required ADRs Before W1 Implementation

Owner must accept or explicitly defer these ADRs before W1 runtime work begins:

- 0001 (auth migration — currently `proposed`, not `accepted`)
- 0002 (database provider — accepted)
- 0003 (cutover rollback — accepted)
- 0004 (position code normalization — accepted)
- 0006 (frontline Flutter client — proposed, gates UC1 path)
- 0007 (branch hub architecture — proposed, gates UC1 path)
- 0008 (handheld failover mode — proposed)
- 0009 (background jobs runtime — proposed)
- 0010 (flutter implementation choices — proposed)
- 0011 (MFA and recovery — proposed)
- 0012 (tenant configuration separation — proposed)
- 0013 (rate limit fallback policy — proposed)
- 0014 (realtime channel lifecycle — proposed)

ADR-0005 (owner identity dual source) is `deferred` and not blocking.

## ADR Reconciliation History

- **2026-05-07** — Owner UC1+UC2+UC3 lock + option A2 reconciliation: adopt matu-superapp ADRs 0006-0012 directly, renumber matu-superapp 0003/0004 → comtammatu 0013/0014, fold matu-superapp 0001/0005 into existing canonical docs. See branch `rebuild/tier1-port-matu-baseline` for diff.
