# Current ADRs

Numbers are stable identifiers. Do not renumber. Deleted files stay in Git
(`0011`, `0029`, `0030`). Compatibility `Dxxx` labels:
[`../decisions.md`](../decisions.md).

Do not implement from an ADR when a runtime owner is named. Read the owning
spec/module/ref first; open the ADR only for the unique decision.

## Reading order

### 1. Governance

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0021](0021-bounded-self-improving-project-operating-loop.md) | One owner per fact; promote and delete | `AGENTS.md`, `docs/agent/rules/` |

### 2. Product and legal entity

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0025](0025-fnb-operating-erp-scope-and-evolution-boundary.md) | Product scope; evolve-in-place; no app split | `docs/spec/architecture.md` |
| [0016](0016-joint-stock-company-operating-model.md) | Company vs branch; operating finance not GL | `docs/modules/finance.md` |

### 3. Topology and clients

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0012](0012-owner-branch-boundary.md) | Owner / Branch / Self planes; capability keys | `docs/spec/architecture.md` |
| [0037](0037-control-home-queue-first-and-personal-plane.md) | Queue-first `/`; `/me` personal | `docs/ref/screen-context-map.md` |
| [0033](0033-work-control-surface-module.md) | Work hosting and membership authority | `docs/spec/page-archetypes.md` |
| [0038](0038-native-android-apps-and-pwa-coexistence.md) | Native in repo `app`; PWA stays | `docs/spec/pwa.md` |
| [0008](0008-operational-audio-alerts.md) | Beep + optional voice; not notifications | `docs/spec/operational-audio-alerts.md` |
| [0009](0009-inventory-operator-viewport.md) | Parked: document-scroll until Owner sign-off | `docs/spec/page-archetypes.md` |

### 4. Auth

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0005](0005-owner-identity-source-separation.md) | Three Owner columns; no dual-source | `docs/modules/auth.md` |
| [0015](0015-authorization-model.md) | TARGET cutover only | `docs/modules/auth.md` |

### 5. Inventory, valuation, POS stock

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0048](0048-branch-warehouse-kitchen-inventory-split.md) | Mandatory warehouse + kitchen per store | `docs/ref/inventory.md` |
| [0040](0040-company-wac-and-cost-restatement.md) | Company WAC; GRN book price; multi-NCC PO | `docs/ref/inventory.md` |
| [0017](0017-ap-central-operations.md) | AP vs inventory value; closed-period posting | `docs/modules/finance.md` |
| [0026](0026-pos-stock-posting-post-and-flag.md) | Post-and-flag; BM sellable allowance | `docs/ref/inventory.md` |
| [0047](0047-recipe-primary-ingredients-and-sellable-capacity.md) | Primary lines gate sellable capacity | `docs/ref/inventory.md` |
| [0028](0028-transfer-shortfall-ownership.md) | Short transfer owned by shipping site | `docs/ref/inventory.md` |
| [0044](0044-production-output-valuation-lineage.md) | `production_output` valuation lineage | `docs/ref/inventory.md` |
| [0045](0045-warehouse-catalog-write-and-ingredient-wizard.md) | `inventory:catalog_write`; catalog RPC | `docs/ref/inventory.md` |
| [0018](0018-record-depth-contract.md) | Record Depth C0-C5 | `docs/spec/design-system.md` C.1 |

### 6. Money, tax, promotions, delivery

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0024](0024-branch-business-day-summary-no-manual-close.md) | 04:00 window is not day-close | `docs/modules/finance.md` |
| [0013](0013-receipt-qr-buyer-window.md) | E-invoice buyer window, discount bake, zero-total | `docs/ref/einvoice-tax.md` |
| [0039](0039-promotions-and-voucher-codes.md) | Campaigns attribute; write existing discount columns | `docs/modules/promotions.md` |
| [0046](0046-food-delivery-android-virtual-printer-agent.md) | Android ESC/POS intake; no vendor SDK | `tools/matu-agent` |

### 7. People

| ADR | Owns | Runtime |
| --- | --- | --- |
| [0019](0019-hrm-roster-contract-options.md) | Roster required; hour-ratio work credit; `wage_unit` | `docs/ref/payroll-pit.md` |
| [0022](0022-hr-control-surface-information-architecture.md) | `/hr` vs `/br/…/team` vs `/me` IA | `docs/ref/screen-context-map.md` |
| [0023](0023-shift-leader-delegation.md) | Shift-leader flag; void queue; no PIN | `docs/ref/branch-operations.md` |
