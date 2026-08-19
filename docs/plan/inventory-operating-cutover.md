# Inventory operating cutover

> **Do not implement from this document.** Runtime and money contract:
> ADR 0040 (company WAC), ADR 0041 (GRN book price; invoice AP/VAT only),
> ADR 0042 (kept GRN qty is PO truth), and `docs/ref/inventory.md`
> (plus `docs/ref/screen-context-map.md` §2.5A). This file is a historical
> discussion log. Wave 1 not Production-applied is a **status fact**, not
> a license to code from the essay.

**Status:** Wave 1 is in the repository (Owner complete 2026-08-20) and is
**not** Production-applied. Wave 2 (hide YCM create + GRN chrome) is in the
repository; no new SQL. Wave 3 (dest-initiated DC, hide YCH create, OD-4
flags) is in the repository and is **not** Production-applied
(`supabase/migrations/20260820030125_dest_dc_and_fulfill_sites.sql`). That
does not make this file implementation SSOT.

**Review tier:** T2 for UI, nav, copy, and screen-map chrome. T3 for RPCs,
ACL templates, migrations, valuation restatement, and any Production apply —
implement those from the ADRs and `docs/ref/inventory.md`, not from the
numbered issues below.

**Decision owner:** Owner (`Bình`). Remaining discussion may continue here.
Owner Accept of a named wave is not permission to implement from this essay.

**Owner locks 2026-08-19:** OD-1, OD-2, OD-3 (option B), **OD-4 (both
central sites allowed; pull prefill `central_supply` first)**, OD-5.
ISS-05, ISS-06, ISS-07, and ISS-09 record the locked forks in place.

**Money authority:** ADR 0041 (GRN books net `Đơn giá`; `HĐ NCC` is AP/VAT only)
and ADR 0042 (kept GRN qty is PO truth). This file **points** at those ADRs.
It does not restate formulas.

**Related:** ADR 0040 (company WAC, append-only restatement), ADR 0028
(transfer shortfall), ADR 0026 (POS post-and-flag), ADR 0029
(withdrawn), ADR 0017 (AP, as amended by 0041), D093 (no branch PO/GRN).
Daily-loop sketch (local Cursor plan, not SSOT):
`inventory_queue-first_84da3fb0.plan.md`. Runtime/contract:
`docs/ref/inventory.md`, `docs/ref/screen-context-map.md` §2.5A,
ADR 0040–0042.

---

## Purpose

Historical discussion log of locked forks, waves, and cross-module impact.
It is not the runtime contract and not an implementation playbook. Agents
implement from ADR 0040–0042 and `docs/ref/inventory.md`. Each issue names:

- what is wrong or unfinished
- what Production does today (snapshot 2026-08-19, re-count before apply)
- the target
- **who else breaks** if Inventory is changed in isolation
- a thorough implementation direction
- hard dependencies and proof
- what must not be mixed into the same change

The operating software links Inventory ↔ Finance ↔ POS ↔ Auth/ACL ↔
central kitchen ↔ Branch. A buy-path RPC, a WAC patch, or an ACL grant in
the wrong order can double-receive stock, dilute `Giá vốn`, hide the only
create path, or let a branch confirm a GRN.

## Non-goals

- Implement UI, RPCs, or migrations from this document.
- Apply SQL to Production (`enloyfnuerqgaqderbwb`).
- Add a `Dxxx` compatibility code.
- Rewrite ADR 0041 / 0042 / 0040 math.
- Treat this file as SSOT over `docs/ref/inventory.md` or ADR 0040–0042.

---

## Cross-module impact matrix

Historical impact notes; do not implement from this matrix. An Inventory
change is not local.

| Inventory change | Finance | POS / food cost | Auth / ACL | Kitchen (`Bếp TT`) | Branch | Other |
| --- | --- | --- | --- | --- | --- | --- |
| Hide YCM create before PO-without-YCM RPC | Accountant cannot allocate **and** warehouse cannot buy | None directly | `procurement:po_create` still Owner+accountant only | Cannot replenish raw | None yet | **Trap.** See ISS-11 |
| GRN `Đơn giá` / WAC restatement | `Tồn kho` asset, `Định mức/phần`, matching review vs book | `Giá vốn món` via remaining-stock propagate (ADR 0040); POS posting ladder uses company WAC | Owner-only repair | `production_wac` if those SKUs were cooked | Overlay qty-only; value moves with equalize | Never silent `UPDATE stock_levels` |
| `HĐ NCC` still on GRN chrome | Duplicate AP entry; invoice may look like it reprices stock | Operators confuse AP price with `Giá vốn` | `procurement:invoice_*` vs warehouse GRN keys | None | None | ADR 0041 already forbids invoice reprice |
| Branch creates DC (retire YCH) | `Chi phí hàng` still `transfer_in` at branch — custody, not a second buy | POS still consumes at Kho CN after receive | Grant `inventory:transfer_create` to BM; strip `inventory:request_*` | Ship / receive own side; **`Giao chi nhánh`** stays DC | Hub door `Yêu cầu hàng` → `Điều chuyển` | Notifications `inventory.stock_request_*` |
| Catalog `Nguồn hàng` both sites (OD-4) | **No.** Pull routing only; `Chi phí hàng` still `transfer_in` | **No.** POS availability is Kho CN on-hand | Catalog CRUD stays Owner | Inbox / ship from either allowed site | Pull `from` prefill `Kho Tổng`-first when both stocked; operator may pick | YCH RPC, checklist, Wave 3 DC create |
| Mark SKU `finished_good` | No GRN value; cost is `production_wac` | Menu recipe may still sell the FG | Catalog CRUD stays Owner | Must have production recipe; never PO/GRN/NCC | Receives FG only by DC | ISS-08 |
| Unit factor change at confirm | AP qty cap (`po_applied_quantity`), invoice match | Consume qty in base | `inventory:units_master` vs GRN confirm | BOM / LSX snapshots | Count pad units | ISS-03 + ISS-04 |
| DROP `recipes.yield_factor` with YCM | None | **POS consume / stock-gate SQL still divides by it** | None | None | Sell path wrong qty | ISS-13 — do not DROP |
| Print / HĐĐT / audio | HĐĐT remains sales invoices | Receipt printers unchanged | None | KDS audio unchanged | None | No warehouse doc on print-agent (D011) |

ACL source: `packages/shared/src/auth/module-acl.ts`,
`packages/shared/src/auth/permissions.ts`,
`packages/shared/src/auth/inventory-roles.ts`. RLS/RPC remains enforcement;
UI hide is not authorization.

---

## Numbered issues

### ISS-01 — Target operating loop

**Problem.** Production still runs YCM → allocate → PO and YCH → DC. The
Owner locked a simpler daily loop. Implementing one screen without the
loop (or hiding a voucher before its replacement RPC exists) breaks the
linked modules.

**Current Production.** Central sites author `purchase_requests` (`YCM`).
`review_purchase_demand` mints receivable POs + Auto-GRN. Branch authors
`stock_requests` (`YCH`); fulfill creates DC. Accountant is in the buy
path. `PO_CREATE_ROLES` = Owner + accountant; central ops are hard-denied.
BM has `inventory:request_*` and `inventory:transfer_receive`, not
`inventory:transfer_create`.

**Target.** Catalog first (NL vs TP, units, NCC mapping). **No YCM, no
YCH.** Warehouse authors **PO-only** buy (one NCC + one receive site).
GRN books net `Đơn giá` (ADR 0041). `HĐ NCC` is AP/VAT only (Finance
`/finance/supplier-invoices`). One DC type; **branch creates both ways**.
Production at `Bếp TT` unchanged. POS `sale_consumption`, `phiếu tiêu hao`,
`hao hụt`, `kiểm kê` engines stay.

**Blast radius.** Finance AP matching uses GRN kept qty (`po_applied`),
not YCM. Food cost stays POS at selling branches (ADR 0026 / 0040), not
GRN and not `phiếu tiêu hao`. Kitchen LSX still needs raw in `Bếp` warehouse
(GRN into `Bếp` or DC from `Kho Tổng`). Branch stops inventing demand via YCH
and starts DC. Notifications
`procurement.purchase_request_submitted` /
`inventory.stock_request_submitted` must retarget or expire (ISS-12).

**Implementation direction.**

1. Wave 0: rewrite `docs/ref/inventory.md`, SOP, glossary retired labels,
   screen-map §2.5A **to this loop** (not freeze-forever prose).
2. Wave 1: new `create_purchase_order` (ISS-11). Do **not** revive dropped
   `send_purchase_order` / `create_purchase_order_with_lines`.
3. Grant `procurement:po_create` to `central_supply_ops` /
   `central_kitchen_lead` with `isProcurementBranchInScope` (pinned site).
   Keep Owner + accountant. Accountant daily job becomes `HĐ NCC`, not
   allocate.
4. Wave 3: dest-initiated `create_stock_transfer_draft`; grant BM
   `inventory:transfer_create`. Ship remains source-only (ADR 0028).
5. Hide YCM/YCH **UI** only after the replacement create path is live on
   Production. Freeze writes (Wave 4) then soak then DROP (Wave 5).

**Dependencies.** ISS-08/09/10 catalog and PO invariants before Wave 1
RPC (ISS-09 / OD-5 locked 2026-08-19). ISS-07 / OD-4 locked (both
sites) before Wave 3 DC picker. ISS-11 gates hide and DROP.

**Proof.** SQL: PO insert with `purchase_request_id` null + Auto-GRN;
BM cannot `confirm_goods_receipt_note`; dest DC create posts **no** stock;
ship is source-only. `lint:copy`, `lint:ui-contract`, `corepack pnpm verify`.
Production apply is owner-delegated.

**Do not mix with.** INV-9 consolidation (ISS-02). FIFO. Branch PO/GRN
(D093). Changing WAC math. Dropping `yield_factor` (ISS-13). Price repair
of historical GRN (ISS-05) in the same migration as PO-without-YCM.

---

### ISS-02 — INV-9 / ADR 0032 deleted; ADR 0029 withdrawn

**Problem.** A future agent can “helpfully” rebuild multi-YCM consolidation
into one PO line, or treat the allocate worksheet as that engine.

**Current Production.** ADR 0029 status is **Withdrawn** (Owner 2026-08-18).
ADR 0032 was deleted without implementation. Suggested qty (INV-10) is
independent (`max(0, min_stock_level − on_hand)` on the line picker).

**Target.** Never build INV-9. One PO may still have many ingredient lines
for **one** NCC — that is ordinary authorship (ISS-10), not consolidation
across vouchers.

**Blast radius.** A junction table between YCM lines and PO lines would
block Wave 5 DROP and reintroduce accountant-invented demand. Finance
matching does not need YCM allocation.

**Implementation direction.** Leave ADR 0029 withdrawn. Suggested qty moves
onto the **PO** picker (Wave 1), then onto the **DC** picker (Wave 3) for
branch low stock — DC, not PO. Delete leftover INV-9 copy if any remains
in `docs/ref/**` during Wave 0.

**Dependencies.** None. Soft-blocks ISS-10 (do not rename allocate-all-NCC
as INV-9).

**Proof.** Static test or doc grep: no new `purchase_request` junction; ADR
0029 remains Withdrawn.

**Do not mix with.** ISS-10 allocate UI (1 NCC default + add row). ISS-11
schema DROP.

---

### ISS-03 — Units: one `Đơn vị chuẩn` + anchors; GRN qty unit ≠ price unit

**Problem.** Pack vs loose vs quote unit, if collapsed into one column,
books carton price as pack price (ADR 0041 already forbids that). Changing
base without the convert RPC desynchronizes on-hand, WAC, BOM, and POS.

**Current Production.** One `ingredient_units.is_base` per ingredient
(`Đơn vị chuẩn`). Other units are anchors (example: `1 thùng = 24 hộp`).
Ledger qty, WAC, and thresholds are in base. Documents snapshot
`to_base_factor`. GRN may persist in a loose unit while `Đơn giá` binds to
`grn_items.unit_cost_unit_id`. Book-value formula lives in **ADR 0041** —
do not copy it here.

**Target.** Keep this graph. Wave 1 PO lines snapshot entry unit + factor;
no price on PO. Confirm GRN still requires `unit_cost > 0` for accepted
qty, quoted per `unit_cost_unit_id`.

**Blast radius.** Finance `Định mức/phần` and POS consume convert to base
through the same factors. ADR 0042 raises PO line qty in **entry** unit
when over-receiving. AP billed qty caps at `po_applied_quantity`. Kitchen
BOM and LSX snapshots use the same unit rows. A wrong factor at confirm
moves WAC, production cost, and later food cost.

**Implementation direction.** No units-engine rewrite in the YCM cutover.
Catalog UI already owns anchors (`save_ingredient_catalog`). GRN UI must
keep qty unit and price unit as **two** pickers. Changing base remains the
existing convert RPC (on-hand, thresholds, current WAC in one transaction;
historical snapshots stay). Compatibility mirrors `receipt_unit_id` /
`issue_unit_id` / `production_unit_id` are ISS-13, not this issue.

**Dependencies.** ISS-04 (snapshot vs live) is the confirm-time cousin.
ISS-05 patch must quote last price in the **price unit**, not assume persist
unit.

**Proof.** Existing ADR 0041 tests: persist 246 loose at 24 000₫/pack
(factor 24) books 246000, not 246 x 24000. Cutover waves must not regress
that.

**Do not mix with.** ISS-04 (live catalog winning at confirm). ISS-05
(zero `unit_cost` repair). Dropping `yield_factor`.

---

### ISS-04 — Snapshot vs live confirm gap (catalog wins at confirm today)

**Problem.** Draft lines store unit + `to_base_factor`. Confirm currently
re-joins the **live** catalog. If Owner edits an anchor between save and
confirm, booked base qty and book value diverge from what the warehouse
typed. This is **not** the units graph (ISS-03).

**Current Production.** Living master/draft snapshots track current
factors; confirmed history is supposed to freeze. Confirm still prefers
live catalog in places — warehouse can confirm a draft against a factor
that no longer matches the screen.

**Target.** Confirm (GRN, DC ship/receive, `phiếu tiêu hao`, `hao hụt`, LSX
complete, POS consume) uses the **line snapshot** written at save/start.
Catalog wins only when creating a **new** draft line. UI should show when
live catalog has drifted from the snapshot (warn, do not silently reprice).

**Blast radius.** Same as ISS-03 plus ADR 0042 PO remainder, AP qty, and
company WAC. POS `sale_consumption` already snapshots recipe qty; do not
“fix” POS by re-reading live `yield_factor` at post (ISS-13). Kitchen LSX
already snapshots BOM at create — keep that.

**Implementation direction.** T3 audit of `confirm_goods_receipt_note` and
sibling confirms: join snapshot columns on the document line, not
`ingredient_units` live. Add a SQL test: change factor on a draft, confirm,
assert booked base qty follows the snapshot. Wave 0 copy: one sentence in
`inventory.md` §2.1. Do **not** fold this into the PO-without-YCM
migration.

**Dependencies.** Independent of YCM hide. Should land before ISS-05 price
patch so restatement math uses the same snapshot the line stored.

**Proof.** Confirm-after-catalog-edit test; no change to ADR 0041 formula,
only to which factor it reads.

**Do not mix with.** ISS-03 graph redesign. ISS-05 historical `unit_cost`
patch. Catalog rebase RPC.

---

### ISS-05 — Seventeen confirmed GRN lines with `unit_cost = 0`; overlay WAC ≠ document price

**Owner locked 2026-08-19:** OD-1, OD-2.

**Problem.** ADR 0041 already-confirmed provisional: 17 accepted confirmed
GRN lines have `unit_cost = 0`. Overlay shows **company WAC**, which mixed
those zeros into the average, so overlay ≠ document `Đơn giá`. Four SKUs
are diluted: `bột năng`, `hộp xôi`, `dầu điều`, `giấm`. A naive “receive again”
or “`kiểm kê` to fix price” corrupts qty.

**Current Production.** New confirms cannot book at 0
(`grn_unit_price_required`). Historical zeros remain. Overlay: warehouse
qty-first, Owner/Kế toán may read WAC after the fold; branch overlay is
qty only. `repair_company_wac_valuation` (ADR 0040 §4) is a generic
append-only repair; it does not by itself type a missing GRN `Đơn giá`.

**Target.**

1. **Do not re-receive.** No second `grn_receipt` qty.
2. Patch document `Đơn giá` on those 17 lines (price unit =
   `unit_cost_unit_id`).
3. Append valuation restatement with **`quantity_delta = 0`** (value-only).
   Never `UPDATE stock_movements.unit_cost`. Never silent `UPDATE
   stock_levels`.
4. **`Kiểm kê` ≠ price.** Stocktake writes `count_adjustment` qty. After
   the price patch, OD-2 requires `kiểm kê` at **every warehouse** — not
   a 4-SKU-only session, not skip, and not a second price path.
5. Overlay may show document snapshot (can be 0 until patched) **beside**
   current book cost (ADR 0040). Do not hide WAC by writing catalog
   `ingredients.unit_cost` (ISS-06).

**Blast radius.** Company WAC for those SKUs (every site, ADR 0040
equalize). If `Bếp` already cooked them, `production_wac` and remaining FG
+ `food_cost` allocations propagate. Finance `Tồn kho` asset and
`Định mức/phần` move. AP invoices already matched on qty are **not**
repriced (ADR 0041). POS future posts use the new company WAC; historical
`sale_consumption` snapshots stay unless the restatement RPC is designed
to propagate remaining stock only (ADR 0040).

**Implementation direction.** Owner-delegated T3 migration or a narrow
Owner-only RPC (not the daily GRN confirm). Sequence:

1. Re-count the 17 lines and on-hand of the 4 diluted SKUs immediately
   before apply.
2. **OD-1 (locked):** for each unpriced line, suggest the last **priced
   confirmed GRN for the same NCC** — not any supplier. Copy `unit_cost`
   and `unit_cost_unit_id` **together**. Do **not** auto-apply; Owner still
   confirms a patch RPC with `quantity_delta = 0`. If that NCC has no
   priced confirmed GRN (examples: `bột năng`, `thịt một gang`), leave the
   field empty until the Owner **types** a price. Do **not** silently take
   another NCC.
3. Write `grn_items.unit_cost` from the confirmed (or typed) price,
   converted into the line’s `unit_cost_unit_id` (ISS-03).
4. Append restatement / equalize (`quantity_delta = 0`).
5. **OD-2 (locked):** after the price patch on diluted SKUs, run
   `kiểm kê` at **every warehouse** — `Kho Tổng`, `Bếp TT`, and every
   branch `Kho CN`. Not a 4-SKU-only session. Not skip. Stocktake remains
   qty (`count_adjustment`), not a second price path.

**Dependencies.** OD-1 and OD-2 locked 2026-08-19. Prefer ISS-04 snapshot
rule first. Do **not** wait on YCM hide. Do **not** stocktake diluted
SKUs before the patch.

**Proof.** After apply: those GRN lines `unit_cost > 0`; company WAC for
the 4 SKUs matches remaining book / qty (rounding-only site spread);
`stock_movements` qty totals unchanged; no new GRN numbers; invoice
`invoice_reprice` still absent.

**Do not mix with.** ISS-06 Owner overwrite of `Giá vốn` (company WAC). ISS-11
DROP. Re-opening ADR 0041 invoice reprice. Generic
`repair_company_wac_valuation` as a substitute for typing `Đơn giá`.

**Repo status (2026-08-19).** RPC `owner_patch_confirmed_grn_unit_cost`,
same-NCC suggestion helper, Owner LIST tab for confirmed zero book prices,
and confirm dialog are in the repository. **Not applied to Production.**
`corepack pnpm db:types` waits until apply. OD-2 stocktake of every
warehouse is after Production apply of this repair — not before, and
not in this slice.

---

### ISS-06 — `Giá tham chiếu` (`ingredients.unit_cost`) ≠ `Giá vốn`

**Owner locked 2026-08-19:** OD-3 = option **B**. Option A (catalog
`Giá tham chiếu` hint only) is **rejected**.

**Problem.** Catalog `ingredients.unit_cost` (`Giá tham chiếu`) is not
company WAC (`Giá vốn`). Owner overwrite today can look like a cost
repair. Glossary `inventory_value` still documents a fallback through
`ingredients.unit_cost`, which would lie if someone “fixes WAC” on the
catalog field.

**Current Production.** About 13 nonzero catalog `unit_cost` rows.
Production confirm no longer overwrites it. Catalog/export still read it.
Overlay WAC is `stock_levels.avg_unit_cost`. Confirmed GRN `Đơn giá` is
not a warehouse-editable field after confirm.

**Target.** Owner may overwrite **`Giá vốn`** (company WAC) through a
**named Owner-only RPC with a reason**. That RPC is an append-only
restatement (same money class as ISS-05 `quantity_delta = 0`). Point at
ADR 0040 and ADR 0041; **do not duplicate WAC math** in this plan.

Rejected / forbidden:

- Option A: treating catalog `Giá tham chiếu` as the money path.
- Silent `UPDATE stock_levels.avg_unit_cost`.
- Letting warehouse freely edit confirmed GRN `Đơn giá`. The Owner RPC
  is the money path; daily GRN confirm stays the book-price capture
  (ADR 0041).

**Blast radius.** T3 money: company WAC, `production_wac` if those SKUs
were cooked, `Định mức/phần`, `Giá vốn món` on remaining stock (ADR 0040
propagate). Finance landing `Tồn kho` keeps reading valuation accounts /
equalized WAC, not the catalog hint. POS posting ladder stays ADR 0026
(company WAC → last-known movement → 0 flag). AP invoices already
matched on qty are not repriced (ADR 0041).

**Implementation direction.** Do not reuse `save_ingredient_catalog` as a
silent money RPC. Named Owner-only SECURITY DEFINER function, grant
narrowly, UI `ReasonConfirmDialog`, proof tests like ISS-05. Catalog
`Giá tham chiếu` may remain a non-book hint; Wave 0 copy must not call it
`Giá vốn`. Do not implement that RPC in the same turn as this lock.

**Dependencies.** Do not use ISS-05’s 17-line patch as the catalog
overwrite path. Independent of YCM.

**Proof.** Owner RPC appends a valuation event, qty unchanged; silent
column UPDATE is absent. Changing catalog `Giá tham chiếu` alone leaves
company WAC unchanged.

**Do not mix with.** ISS-05 historical GRN zeros. Overlay “make the number
match” by writing the catalog field. FIFO. Rewriting ADR 0040 formulas.

**Repo status (2026-08-20).** RPC `owner_set_company_wac`, Owner stock-overlay
dialog labeled `Ghi Giá vốn` (quoted per base unit), and proof tests are in
the repository. **Not applied to Production.** `corepack pnpm db:types`
waits until apply. Distinct from ISS-05
`owner_patch_confirmed_grn_unit_cost` (confirmed GRN book unit cost).
Catalog `Giá tham chiếu` stays a non-book hint.

---

### ISS-07 — `Nguồn hàng` is which central site(s) may fulfill a branch pull

**Owner locked 2026-08-19:** OD-4 — **both** central sites allowed;
pull prefill `central_supply` first. Exclusive XOR (`Kho Tổng` **or**
`Bếp TT` as a mandatory single catalog enum) is **rejected**. Max-on-hand
and always-ask when both have qty are **rejected**.

**Problem.** `default_fulfill_site_kind` is easy to hear as “where stock
currently sits,” or as “pick exactly one warehouse.” Owner meaning: the
ingredient **can be fulfilled from both** central warehouses — `Kho Tổng`
and `Bếp Trung Tâm` both may have that SKU. Physical on-hand already
lives per site in `stock_levels` (GRN/DC already put qty at both). The
catalog flag only answers **which sites are allowed `from` on a branch
pull**. It is not location and not on-hand qty.

**Missing (`Thiếu Nguồn hàng`)** means **neither** `Kho Tổng` nor
`Bếp TT` is ticked — Owner has not assigned any allowed `from` site.
It is not “out of stock at one warehouse.”

`Má Tư` examples:

- Purchased NL that both warehouses keep → tick **both**.
- `Nước mắm` that only `Kho Tổng` issues → tick **`Kho Tổng`** only.
- `Cơm tấm thành phẩm` (kitchen FG) → typically tick **`Bếp Trung Tâm`**
  only (ISS-08: TP never PO/GRN).
- Unassigned → neither ticked → checklist `Thiếu Nguồn hàng`.

**Current Production.** Exclusive column
`ingredients.default_fulfill_site_kind` (`central_supply` |
`central_kitchen` | null). YCH **hard-blocks** a line when mapping is
NULL (`ingredient_fulfill_site_required`). Branch request editor copies
one `fulfill_site_kind` and filters pickers by that kind. Checklist
treats anything other than exactly one of the two enums as a gap.
`stock_levels` is already keyed per site — qty at both warehouses
already works. Target loop **retires YCH**; after Wave 3 this mapping
only **prefills** the DC `from` site.

**Target.** Catalog allows **both**. Replace the exclusive enum in the
**target schema** (later wave with YCH/DC — **no Production apply** in
the lock turn): two booleans or `fulfill_site_kinds[]`. Ingredient form:
two checkboxes **`Kho Tổng`** + **`Bếp TT`**. Branch pull (target:
dest-initiated DC; today: YCH):

- One site ticked → prefill `from` that site.
- Both ticked **and both have on-hand** → prefill `from` =
  `central_supply` (`Kho Tổng`). Not max-on-hand. Not always-ask.
- Both ticked, `Kho Tổng` has **no** on-hand, `Bếp TT` has qty → prefill
  `Bếp TT` (sensible default). `Bếp TT` is the prefill only when `Kho Tổng`
  is not an allowed fulfill source or has no on-hand.
- Operator may still change `from` on the document among allowed sites.
- Neither ticked → still `Thiếu Nguồn hàng`. Do not invent a silent
  default.

Never treat `Nguồn hàng` as `stock_levels.location_id`. Branch low stock
creates **DC**, not PO. Same-site `Kho↔Bếp` fake transfers stay
forbidden.

**Owner lock (OD-4) — closed 2026-08-19:**

| Locked | Behavior |
| --- | --- |
| **Both allowed** | Catalog may assign `Kho Tổng`, `Bếp TT`, or both. A branch pull may use either allowed site that has on-hand. Do not force one exclusive source. |
| **`Thiếu` = none ticked** | Checklist gap until Owner ticks at least one site. |
| **Prefill `central_supply` first** | When both sites are ticked **and both have on-hand**, pull DC (today YCH) prefills `from` = `central_supply` (`Kho Tổng`). Operator may still change `from` on the document. **Fallback:** `Kho Tổng` ticked but qty 0 and `Bếp TT` has qty → prefill `Bếp TT`. `Bếp TT` is the prefill only when `Kho Tổng` is not an allowed fulfill source or has no on-hand. |

Rejected: XOR fork (mandatory single `default_fulfill_site_kind` enum).
Rejected: treating “Thiếu” as “stock sits at only one warehouse.”
Rejected: auto-pick max on-hand when both have qty.
Rejected: always-ask when both have qty.

**Blast radius.** YCH RPC (`ingredient_fulfill_site_required`, line
`fulfill_site_kind` exclusive), branch request editor, catalog checklist
`Thiếu Nguồn hàng` + landing gap counts, ingredient form radio →
checkboxes, Wave 3 dest-initiated DC `from` prefill. Kitchen
**`Giao chi nhánh`** is still DC of FG, not this checklist.
**Finance / POS / WAC: no** — pull routing only; `Chi phí hàng` follows
`transfer_in`; POS availability is Kho CN on-hand. Wrong `from` still →
ADR 0028 shortfall at the wrong site.

**Implementation direction.** Do **not** ship a Production enum
migration in the OD-lock turn. Wave 3 (with YCH/DC):

1. Schema: `fulfill_site_kinds text[]` or two booleans. Migrate the
   exclusive column: `central_supply` → `Kho Tổng` only, `central_kitchen`
   → `Bếp TT` only, NULL → neither.
2. `save_ingredient_catalog` accepts both. Checklist gap = neither
   checked.
3. UI: two checkboxes on the ingredient form (`Kho Tổng` + `Bếp TT`).
4. DC create: prefill rules above; create still posts no stock; ship
   source-only (ADR 0028). Branch on-hand CTA `Cần bổ sung` → create DC.
5. Keep today’s YCH hard-block until Wave 5 DROP. Do **not** expand YCH
   to dual-source as a Wave 1 side quest.
6. Remove leftover hard-block strings when YCH RPCs DROP (Wave 5).

Wave 0: glossary / `inventory.md` sentence: `Nguồn hàng` = allowed `from`
site(s), not location.

**Dependencies.** OD-4 locked (both allowed + `Kho Tổng`-first prefill).
Wave 3 dest-DC ACL. ISS-08 (TP typically ticks `Bếp TT` only, never PO).
No remaining OD-4 UX fork. Does not block Wave 3 start after Accept.

**Proof.** Catalog save with both sites; checklist gap only when
neither; DC draft prefills the single ticked site; dual-ticked SKU with
on-hand at both prefills `central_supply`; dual-ticked `Kho Tổng` qty 0
and `Bếp` qty > 0 prefills `Bếp TT`; operator can still change `from`;
create posts no stock. Exclusive-enum XOR, max-on-hand prefill, and
always-ask are absent in the target.

**Do not mix with.** ISS-08 item kind. ISS-11 / Wave 1 PO-without-YCM.
Stocktake. On-hand adjust dialog. “Which warehouse currently holds qty”
as the catalog meaning. Finance/WAC.

---

### ISS-08 — `Là thành phẩm` means not purchased

**Problem.** `finished_good` is a `Bếp TT` SKU with a production recipe, not
an ERP “manufactured vs traded” flag. If a purchased bottle is marked TP,
warehouse cannot PO/GRN it. If a kitchen SKU is left as NL, it can be
bought from NCC and never get `production_wac`.

**Current Production.** Kind on `ingredients`. GRN/PO pickers omit
finished goods. `supplier_items` should be raw only. Cost of TP =
`production_wac` of the batch (ADR 0040). Moves to CN only by DC.

**Target.** Keep the invariant. Catalog checkbox `Là thành phẩm` requires
an active production recipe before the kind can stick (or keep
needs_review until recipe exists — Owner may tighten in Wave 0 copy).
Never map TP to NCC. Never put TP on PO/GRN. Menu recipes may still sell
FG (POS consume at CN after DC).

**Blast radius.** Kitchen cannot start LSX without raw NL in `Bếp`.
Finance never books GRN WAC on FG. POS can sell FG; food cost is WAC of
that FG at CN (production_wac equalized), not a purchase price. Branch
must not see a GRN tile for FG.

**Implementation direction.** `save_ingredient_catalog` reject: TP +
`supplier_items`, TP + PO line, kind flip while open PO/GRN lines exist.
Wave 1 `create_purchase_order` lines: `item_kind = raw_material` only.
Wave 0 copy. No multi-level BOM in v1.

**Dependencies.** ISS-09 mapping. ISS-07: TP typically ticks `Bếp TT`
only (never PO); OD-4 still allows both ticks on purchased NL.

**Proof.** SQL: insert PO line for FG raises; GRN picker query returns 0
FG; production complete still the only `production_output` path.

**Do not mix with.** Purchased packaging that looks “finished” in the
kitchen — those stay `raw_material` (ADR 0040). ISS-05 SKU list (those
four are purchased NL).

---

### ISS-09 — `supplier_items` required for PO catalog, not for `HĐ NCC`

**Owner locked 2026-08-19:** OD-5 — picker may **warn** on add; **send
still blocks** unmapped lines.

**Problem.** Mapping ingredient ↔ NCC is a **buy** constraint. `HĐ NCC`
matches confirmed GRN qty for AP/VAT (ADR 0017/0041). Using the same
block on invoice create would trap Kế toán after goods are already in.

**Current Production.** Allocate / PO from YCM requires active
`supplier_items` for that NCC. Invoice allocation is GRN/PO, not
`supplier_items`.

**Target.** Wave 1 PO line picker: if the ingredient is not on
`supplier_items` for that NCC, the UI may **warn**. The operator **cannot
send** a PO that still has unmapped lines. Catalog mapping remains
required to complete a PO. One PO = one NCC always. `HĐ` create: no
mapping check beyond “GRN belongs to this NCC.”

Rejected: send (or Auto-GRN) with unmapped lines. Hard-block **on add**
is not required; hard-block **on send** is.

**Blast radius.** Warn-on-add without a send gate would let Auto-GRN mint
a GRN for an unmapped SKU. Catalog CRUD is Owner-only, so warehouse
escalates mapping fixes to Owner. Accountant invoice path must not
inherit the PO picker rule.

**Implementation direction.** RPC `create_purchase_order` may accept a
draft with unmapped lines; **submit / send must reject** them. UI:
banner on add; preferred NCC first. Do not put mapping CRUD on the PO
form (Owner catalog `/inventory/suppliers`). Finance invoice actions stay
on GRN ids. Do not implement this send gate in the same turn as this lock.

**Dependencies.** ISS-08 (no FG mapping). ISS-10 (no multi-NCC worksheet).
OD-5 locked 2026-08-19.

**Proof.** Unmapped line: warn on add; send/submit raises; invoice on a
confirmed GRN still saves without touching `supplier_items`.

**Do not mix with.** ISS-10 allocate worksheet. Price lists
(`procurement:price_list_*`) — not this cutover.

---

### ISS-10 — Allocate UI: one NCC default + add row; Wave 1 removes worksheet

**Problem.** Today’s `Phân bổ` worksheet exists because YCM is
supplier-agnostic demand. Target buy is warehouse-authored PO. Leaving the
worksheet after PO-without-YCM ships two create paths.

**Current Production.** Dirty tree already defaults **one** NCC row
(preferred / only / manual) and **`Thêm dòng`** to split. Lines without NCC
are blocked. `review_purchase_demand` still creates POs from that
worksheet. **1 PO = 1 NCC** already.

**Target.** Keep 1 PO = 1 NCC always. Wave 1: **`Tạo đơn`** on the orders
tab (NCC + receive site + lines). Remove needs-tab create/allocate **after**
the RPC is live. Two suppliers → two POs, never one worksheet.

**Blast radius.** Accountant loses allocate as a daily job (ISS-01).
Suggested qty (INV-10) must appear on the PO picker or it vanishes with
the worksheet. Notifications `purchase_request_submitted` die with Wave 4.

**Implementation direction.** Do not ship a “mini worksheet” inside
`create_purchase_order`. `p_supplier_id` is a single bigint. Hide
`save_purchase_demand*` UI after Wave 1 RPC; REVOKE at Wave 4. Suggested
qty helper stays `apps/web/lib/inventory/suggested-order-qty.ts`.

**Dependencies.** Wave 1 RPC (ISS-11). ISS-02 (this is not INV-9).

**Proof.** UI test: orders tab create has one NCC; no allocate dialog on
the happy path after hide. RPC rejects a second supplier id.

**Do not mix with.** INV-9. Invoice split across GRNs (ADR 0017 still
allows one `HĐ` to allocate multiple confirmed GRNs of **one** NCC).

---

### ISS-11 — Cutover data: freeze writes → soak → DROP; cannot hide YCM first

**Problem.** Owner wants a clean schema, not freeze-forever. Drop-now and
hide-now are both unsafe. Every live PO still points at a YCM
(`purchase_request_id` RESTRICT). There is **no** Production RPC that
inserts a PO without that pointer.

**Current Production (read-only snapshot 2026-08-19, ref
`enloyfnuerqgaqderbwb` — re-count before every apply).**

| Fact | n / note |
| --- | --- |
| PO without YCM FK | **0 / 78** — cannot DROP FKs/tables now |
| Leftover YCM | `YCM-07082026-0022` **`Sâm 50 set`** unordered (`partially_ordered`). Close remainder **without convert**, then a new warehouse PO after Wave 1 |
| YCH `submitted` | 2 (`YC-31072026-0001` `Bếp TT`, `YC-08082026-0002` `Nguyễn Hữu Thọ`). DCs **already received**. **Do not convert** (double-receive). Hygiene `close_stock_request` before Wave 4 |
| Auto-GRN recovery | 5 `approved` POs + 1 `partially_received` without an active draft GRN. Ops: `create_grn_draft_from_po` (does not require YCM). Does not block schema |
| In-transit DC | 0 at evening recount (complete-in-old-path if any reopen) |

Treatments (only three): **keep as history**, **complete in old path**,
**close without convert**. Convert is allowed only when the source has
**no** stock movement and **no** live target document — Production has
**no** such YCM/YCH.

Dead on Production (stay dead): `send_purchase_order`,
`create_purchase_order_from_request`, `create_purchase_order_with_lines`,
and related. **There is no `create_purchase_order`.**

**Target.** New documents omit FKs (`purchase_request_id` already
nullable). Freeze product writes (REVOKE + ACL strip). Soak: zero new
`YCM-`/`YC-` numbers, zero non-terminal YCM/YCH. Then DROP FKs → DROP
tables → DROP frozen functions → remove prefixes. History after DROP:
operators use PO / GRN / DC numbers. Git + this plan are the archive.

**Blast radius.** Hide YCM create today → `Kho Tổng` / `Bếp TT` cannot buy
(Finance cannot allocate either). Convert the two YCH → second DC on
already-received goods → double `transfer_in` at dest and false
`Chi phí hàng`. DROP while 78 POs RESTRICT → migration abort or orphan
integrity failure. Notifications and `/inventory/purchase-requests` shim
must redirect only after Wave 4, not before Wave 1.

**Implementation direction.**

Wave 1 RPC (not implemented until Accept):

```text
create_purchase_order(
  p_po_id bigint,              -- null = insert
  p_supplier_id bigint,
  p_branch_id bigint,          -- central_supply | central_kitchen only
  p_notes text,
  p_needed_by date,
  p_lines jsonb,               -- [{ingredient_id, quantity, entry_unit_id, notes?}]
  p_submit boolean,            -- false = draft; true = receivable + Auto-GRN
  p_idempotency_key uuid
) RETURNS jsonb                -- {po_id, po_number, status, grn_id?}
```

Invariants: insert `purchase_request_id` and line
`purchase_request_item_id` **NULL**; never mint a YCM; one NCC + one
receive site; raw only (ISS-08); mapping required **at send** (ISS-09 /
OD-5 — warn-on-add is UI only); no price columns; authorize
`procurement:po_create` on `p_branch_id`; receivable status stays
**`approved`** so Auto-GRN / GRN LIST do not fork `sent` vs `approved`;
on submit call `private.ensure_grn_draft_for_po`. Grant EXECUTE to
`authenticated` + `service_role`; REVOKE PUBLIC/anon.

Until that RPC is Production-ready: **leave YCM create UI on.**

Wave 4 deny: `save_purchase_demand*`, `review_purchase_demand`,
`save_stock_request`, `fulfill_stock_request_lines`,
`reject_stock_request_lines`. Keep `close_*` / `cancel_*` until hygiene
is done. REVOKE YCH table DML from `anon`/`authenticated` (over-broad
GRANTs today; RLS write is already false). Strip
`procurement:request_manage` and `inventory:request_*` from live
templates.

**Dependencies.** ISS-01, ISS-08, ISS-09, ISS-10. Hygiene of leftover YCM
remainder and two YCH before Wave 4. Wave 3 before hiding YCH. Soak before
Wave 5. Auto-GRN recovery is **ops**, not a schema blocker.

**Proof.** After Wave 1: a warehouse user creates a PO with null YCM FK and
gets a draft GRN. After Wave 4: those write RPCs raise for `authenticated`.
After Wave 5: tables gone; `create_purchase_order` and DC RPCs still work;
POS consume still works (ISS-13).

**Do not mix with.** ISS-05 restatement. ISS-13 `yield_factor` DROP.
Silent UPDATE of confirmed stock. Converting received YCH/YCM.

---

### ISS-12 — Screen map: landing queue split; chrome follows waves

**Problem.** `/inventory` LANDING still mixes YCH + DC + GRN + YCM into
one attention blob. Hiding YCM on the landing before Wave 1 RPC repeats
ISS-11’s trap in the UI. Warehouse GRN LIST still carries invoice chrome.

**Current Production.** §2.5A already records `hiện → mục tiêu` per
route (do not open a parallel map). Dirty tree: landing should split YCH
vs DC and add **`Chờ đơn giá`**. Branch hub four doors include `Yêu cầu hàng`.
`/inventory/supplier-invoices` is a REDIRECT-SHIM to Finance.

**Target.** Control landing: queue-first `Cần xử lý` with distinct chips
for `Chờ nhập hàng`, **`Chờ đơn giá`**, `Điều chuyển` (`cần xuất` / `cần nhận`),
not YCM/YCH after those waves. Branch hub: `Tồn` / `Điều chuyển` / `Kiểm kê`
/ `Hao hụt`; `Phân công đếm` stays under **`Đội`**. GRN LIST default
`Chờ nhập hàng`; no pending-invoice badge for warehouse. Accountant: Finance `HĐ NCC`
only.

**Blast radius.** Wrong landing CTA sends BM to YCH after Wave 3, or
warehouse to YCM after Wave 1 hide. Notifications action URLs
(`canonicalize_notification`) must match the new routes or toasts open
404 / old inbox. Work-control home (ADR 0037) YCM hrefs. No print-agent
change. No POS chrome.

**Implementation direction.** Wave 0: rewrite §2.5A target column into
operating present tense only after Accept; until then keep `hiện` vs
`mục tiêu`. Wave 1: orders-tab **`Tạo đơn`**; do not remove needs tab until RPC
live. Wave 2: GRN chrome + `Chờ đơn giá`. Wave 3: hub door + DC routes;
retarget `inventory.stock_request_*` to DC. Wave 4: redirects
`/inventory/purchase-requests` → PO, `/br/.../stock/requests` → DC;
expire `procurement.purchase_request_submitted`. Follow
`docs/spec/page-archetypes.md` + design-system; `lint:ui-contract`.

**Dependencies.** ISS-11 Wave 1 before YCM hide. ISS-07/Wave 3 before YCH
hide. ISS-05 does not need a landing chip beyond `Chờ đơn giá` for **draft**
lines (historical zeros are a repair, not a warehouse queue).

**Proof.** `lint:copy`; screen-map tests; notification URL static tests;
BM cannot open GRN create.

**Do not mix with.** Canvas-only IA that contradicts §2.5A. Dropping
tables in a UI PR.

---

### ISS-13 — Leftover columns: document unit mirrors; do not DROP `yield_factor`

**Problem.** A “clean schema” pass that DROPs YCM/YCH can take nearby
unused-looking columns with it. Some are still live.

**Current Production.**

| Object | Finding |
| --- | --- |
| `ingredients.receipt_unit_id` / `issue_unit_id` / `production_unit_id` | Still required by `save_ingredient_catalog`. All 129 ingredients have receipt+issue; 41 have production. Docs already call them compatibility mirrors |
| `ingredients.unit_cost` | ISS-06 — not company WAC |
| `recipes.yield_factor` | **Live.** POS consume and stock-gate SQL still divide by it |
| `ingredient_fulfill_site_required` | YCH hard-block leftover. Remove strings when YCH RPCs DROP. Target DC picker uses allowed `from` site(s) (OD-4 both allowed), not “where stock sits.” |

**Target.** Separate from voucher DROP. After catalog RPC stops writing
mirrors, drop those three unit columns in a later catalog pass. **Never**
DROP `recipes.yield_factor` in the YCM/YCH wave. ISS-04/POS may later
snapshot yield onto the order; that is a POS change, not this cutover.

**Blast radius.** Dropping `yield_factor` silently changes every
`sale_consumption` qty and stock-gate remaining → POS over/under deduct,
false 86, wrong `Giá vốn món`. Dropping receipt/issue units while
`save_ingredient_catalog` still writes them → catalog save fails → no NL
master.

**Implementation direction.** Wave 5 DROP list is YCM/YCH objects only
(ISS-11 table). File a later catalog RPC change to stop writing mirrors,
then drop columns. POS yield is out of scope (see below).

**Dependencies.** Does not block Wave 1.

**Proof.** Wave 5 migration grep: no `yield_factor`. Catalog save still
succeeds after Wave 5.

**Do not mix with.** ISS-03 units graph. ISS-11 voucher DROP. Silent
stock UPDATE.

---

## Wave order (dependency-respecting)

Hard gates, not optional follow-ups:

1. **Cannot hide YCM create** until Wave 1 `create_purchase_order` is
   applied on Production and the warehouse **`Tạo đơn`** button works.
2. **Cannot hide YCH / grant-only BM DC** until Wave 3 dest-initiated DC
   is live (create posts no stock; ship source-only).
3. **Cannot DROP** YCM/YCH tables until Wave 4 freeze + soak (zero new
   prefixes, zero non-terminal rows) **and** new POs exist with null FKs
   (today 0/78).
4. **Cannot `kiểm kê` diluted SKUs to “fix WAC”** before ISS-05 price patch
   (`quantity_delta = 0`).
5. **Cannot** fold ISS-05, ISS-06 fork B, ISS-04, and Wave 1 into one
   migration.

| Wave | What ships | Blocked until | Parallel OK |
| --- | --- | --- | --- |
| **0 Docs** | `inventory.md` / SOP / §2.5A / glossary to the target loop | Owner Accept of ISS-01; OD-3/4/5 copy locked 2026-08-19 (`Nguồn hàng` = both sites allowed) | Pointer-only edits |
| **ISS-05 repair** | Patch 17 `Đơn giá` (same-NCC last priced GRN, or Owner-typed if none) + restatement qty 0; then `kiểm kê` **every warehouse** | OD-1, OD-2 locked 2026-08-19; prefer ISS-04 | Independent of YCM hide |
| **1 PO without YCM** | RPC `create_purchase_order` + `PO_CREATE_ROLES` + orders-tab `"Tạo đơn"` + Auto-GRN; OD-5 warn-on-add / block-on-send. **Repo shipped; Owner complete 2026-08-20. Production apply waits Owner «apply Production».** | Wave 0 copy for PO; ISS-08/09/10; OD-5 locked 2026-08-19. | ISS-05 |
| **2 GRN chrome + hide YCM create** | Hide **`Tạo yêu cầu mua`**; needs tab history/read; `/purchase-requests/new` → **`Tạo đơn`**; LIST default `Chờ nhập hàng`; strip warehouse invoice CTA / YCM filters; Owner **`Chờ đơn giá`** stays. `save_purchase_demand*` still executable (Wave 4 freeze). **Repo done (Owner continue 2026-08-20).** No SQL. Production hide waits Wave 1 apply. | Wave 1 RPC in repo (Owner 2026-08-20). | ISS-05 overlay copy |
| **3 Dest DC / retire YCH UI** | BM `inventory:transfer_create` + `transfer_ship`; OD-4 both-site flags; hub door to dest-initiated DC; `/requests/new` redirects to DC create. **Repo shipped 2026-08-20. Production apply waits Owner «apply Production».** `save_stock_request*` still executable (Wave 4 freeze). | OD-4 locked 2026-08-19 (both sites + `Kho Tổng`-first prefill); in-transit DCs complete in old path | After Wave 1 |
| **4 Freeze writes** | REVOKE YCM/YCH writes; strip ACL; redirects; expire request notifications | Wave 1 **and** Wave 3 live; hygiene close leftover vouchers | — |
| **5 Soak then DROP** | DROP FKs → tables → frozen functions → `YC`/`YCM` prefixes | Soak evidence; re-count | ISS-13 mirrors **not** in this DROP |

Rollback: never rewrite `stock_movements` qty or WAC backwards. Wave 1–3:
restore previous UI/ACL; leave null-YCM POs and dest DCs (they are already
target documents). Wave 4: restore EXECUTE + template keys. Production
apply remains `scripts/supabase-production-push.mjs` with explicit Owner
delegation.

---

## Owner decisions

Discussion checklist — not a chat log and not an implementation playbook.
Dependent waves still wait on open forks. Do not start product code from
this file.

### Owner locked 2026-08-19

| ID | Lock | Closes |
| --- | --- | --- |
| **OD-1** | Last priced confirmed GRN for the **same NCC** (not any supplier). Copy `unit_cost` + `unit_cost_unit_id` together. No auto-apply; Owner confirm / RPC patch with `quantity_delta = 0`. No same-NCC priced GRN (`bột năng`, `thịt một gang`, …) stays unfilled until Owner types a price — never silently take another NCC. | ISS-05 |
| **OD-2** | After the price patch on diluted SKUs, `kiểm kê` **every warehouse** (`Kho Tổng`, `Bếp TT`, every branch `Kho CN`). Not 4-SKU-only. Not skip. | ISS-05 |
| **OD-3** | Option **B**: Owner may overwrite **`Giá vốn`** (company WAC) via a named RPC with reason, append-only restatement. Not option A (catalog `Giá tham chiếu` hint only). No silent `UPDATE stock_levels.avg_unit_cost`. Confirmed GRN `Đơn giá` stays not freely editable by warehouse. Point ADR 0040 / 0041; do not duplicate WAC math. | ISS-06 |
| **OD-4** | **Both** central sites allowed. Catalog may tick `Kho Tổng`, `Bếp TT`, or both — not an exclusive XOR enum. `Thiếu Nguồn hàng` = neither ticked (not “stock sits at one warehouse”). Pull (target DC; today YCH) may use either allowed site that has on-hand. When **both** are ticked **and both have on-hand**, prefill `from` = `central_supply` (`Kho Tổng`) — not max-on-hand, not always-ask. Fallback: `Kho Tổng` ticked but qty 0 and `Bếp` has qty → `Bếp TT`. Operator may change `from` on the document. Physical qty already per-site via `stock_levels`. Schema change is a later YCH/DC wave — not this turn. | ISS-07 |
| **OD-5** | PO line picker may **warn** if the ingredient is not on `supplier_items` for that NCC, but **still block on send**. Catalog mapping remains required to complete a PO. | ISS-09 |

Already locked (do not re-ask unless Owner reopens): no YCM, no YCH;
PO-only buy; GRN books net `Đơn giá`; `HĐ NCC` AP/VAT only; one DC type,
branch both ways; INV-9/ADR 0032 deleted; ADR 0029 withdrawn; leftover
YCM `Sâm 50 set` **close without convert**; two submitted YCH **do not
convert**; 1 PO = 1 NCC; no re-receive for ISS-05; stocktake ≠ price;
`yield_factor` stays; OD-1 / OD-2 / OD-3 B / **OD-4 both sites + `Kho Tổng`-first prefill** / OD-5 as the table above. No remaining OD-4 UX
fork. Does not mix with Wave 1.

---

## Out of scope

- FIFO / lots / FEFO / vendor portal / payment proposal batches
- INV-9 / ADR 0032 revival
- DROP `recipes.yield_factor` with YCM/YCH
- Silent `UPDATE stock_levels` (qty or WAC)
- Branch PO or Branch GRN (D093)
- Changing ADR 0041 / 0042 / 0040 formulas
- Multi-level BOM, labor, overhead
- Revival of daily supplier-return UI or issue type `other`
- DROP YCM/YCH tables before Wave 5 soak
- Using `kiểm kê` or overlay catalog cost as a WAC repair
- Print-agent / HĐĐT / operational audio changes
