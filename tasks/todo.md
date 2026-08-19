# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Early clock-in, delayed checkout auto-approve, and upcoming schedule

State: doing
Kind: feature
Tier: T3
Lane: hr/self-service
Exit: Assigned staff can punch 60 minutes before shift start; Ca names the wait ("chưa đến giờ chấm công") instead of "chưa phân ca"; "Lịch" shows rostered upcoming shifts; "Kết ca" waits for manager and auto-closes only after 2 hours if still pending.
Evidence: `employee-default-shift.test.ts`, `schedule-month.test.ts`, `shift-clock-window-static.test.ts`, `checkout-auto-approve.test.ts`.

UI Advisor Gate
- Surface: `/br/[branchId]/shift` + `/shift/schedule` + `/me/clock` + `/me/schedule`; route family: branch personal / staff; plane: `branch` / `staff`; change: behavior + copy
- Context: screen-context-map §2.4A Ca / "Lịch ca"; actor: cashier/chef/branch_staff; job: punch the assigned shift at the workplace and see the next rostered shifts
- Journey: arrive early → wait copy with start/open time → punch from T-60; end of shift → "Kết ca" waits for manager → leftover pending auto-closes after 2 hours; "Lịch" lists upcoming roster
- Information order: 1) assigned shift name/window 2) punch-open time 3) upcoming roster; exclude: wall-clock default shift
- Pattern: LANDING + SETTINGS-PANEL punch; exemplar `lib/staff-runtime/page.tsx` + `schedule-client.tsx`
- States: too_early / open / too_late / unassigned / working / checkout_pending / done
- Block: none — existing BranchOperator/Employee panels
- Responsive: phone primary
- Verification: unit + static tests, cron registration

- [ ] Smoke: arrive 30 minutes before a rostered shift and punch; "Lịch" shows the next assigned shift
- [ ] Smoke: "Kết ca" stays pending for the manager; a leftover request older than 2 hours auto-closes

UI Advisor Gate extras: clock-in still requires `shift_assignments`. Leftover checkout auto-approve runs on Vercel cron (`/api/cron/attendance-checkout-auto-approve`) because two unrelated pending migrations already occupy `supabase/migrations/`. Fold into a service-role RPC + pg_cron when that apply window is clean.

## Self-Order guest UX: header, qty, bill, VAT payment

State: verify
Kind: feature
Tier: T2
Lane: pos
Exit: Guest QR menu fits brand + table + actions; cards use `+` then `- qty +`; bill progress reaches `Phục vụ`; accompaniment names have no extra `+đ`; promo sits in the bill footer as `Mã khuyến mãi`; payment is `Tiền mặt` / `Chuyển khoản` with optional GTGT MST lookup.
Evidence: `self-order-cutover-static.test.ts`, `self-order-payment-contract.test.ts`, `self-order-bill-lines.test.ts`, `self-order-simple-cart.test.ts`, `self-order-promo-static.test.ts`, `self-order-kitchen-progress.test.ts`.

UI Advisor Gate
- Surface: `/q/[token]` G1/G6/G7; route family: public QR; plane: `public`; change: layout + copy + payment flow
- Context: screen-context-map §2.12; actor: guest on phone; job: order, follow kitchen, pay
- Journey: browse → qty stepper / variant sheet → bill → pay cash or transfer; optional VAT MST
- Information order: 1) table + menu 2) line total 3) payable total + methods; exclude: select-then-continue payment
- Pattern: PUBLIC-WORKFLOW; block `public-transaction`; exemplar `apps/web/app/q/[token]/page.tsx` + `self-order-client.tsx`
- States: empty cart / qty / pending / cooking / serving / payment / VAT lookup
- Block: `public-transaction`
- Responsive: phone-first 390
- Verification: static + unit tests, `corepack pnpm verify`

- [ ] Phone smoke: header does not wrap brand+table into the two actions
- [ ] Phone smoke: kitchen ready advances progress to `Phục vụ`
- [ ] Phone smoke: VAT check looks up MST then `Tiền mặt` / `Chuyển khoản` create the intent

## Self-Order guest promo codes and line discount visibility

State: verify
Kind: feature
Tier: T3
Lane: pos
Exit: Guest can enter their own promo/voucher code on Self-Order G6 after one open POS order exists. Staff and guests see which line is discounted. Printed line amount stays gross; a promo subline names the item amount. Guest apply is order_pct / order_vnd / voucher_face only.
Evidence: Applied Production `20260819131047` on `enloyfnuerqgaqderbwb` (dry-run list was that file only). Catalog: both guest RPCs `SECURITY DEFINER`, empty `search_path`, execute `service_role` only. `corepack pnpm db:types` regenerated (`self_order_apply_promotion_code`, `self_order_clear_promotion`). Static promo/print tests green. Full `corepack pnpm verify` still blocked by unrelated dirty-tree typecheck.

UI Advisor Gate
- Surface: `/q/[token]` G6 + POS order lines + receipt print; route family: public QR + station POS; plane: `public` + `station_chrome`; change: guest promo apply + line money visibility
- Context: screen-context-map §2.12 / §2.4D; actor: guest on phone + cashier; job: apply a code and follow promotional money per line
- Journey: staff opens table → guest opens bill → enters code → snapshot totals; live payment intent locks apply/clear
- Information order: 1) discounted line net vs gross 2) campaign/code footer 3) payable total; exclude: picker kinds, cart-stage codes
- Pattern: PUBLIC-WORKFLOW; block `public-transaction`; exemplar `apps/web/app/q/[token]/page.tsx` + `self-order-client.tsx` / `bill-drawer.tsx`
- States: no open order / open / payment locked / applied / staff-required fail
- Block: `public-transaction`
- Responsive: phone-first bill sheet
- Verification: static tests, print-render, `lint:copy`, `lint:migration-lineage`, `corepack pnpm verify`

- [ ] Guest applies an order-level code on G6 after staff opens the table
- [ ] Discounted POS/Self-Order/print lines show the promotional amount on that line

## YCM/YCH schema cleanup (freeze then drop)

State: blocked
Kind: feature
Tier: T3
Lane: inventory
Exit: Warehouse creates PO with `purchase_request_id` null and Auto-GRN; YCM/YCH writes frozen; tables dropped only after soak. Do not convert a YCM already turned into a PO, or a YCH already fulfilled into a received DC.
Blocker: Production has no `create_purchase_order` without YCM (`send_purchase_order` dropped). Hiding YCM create would trap central warehouse / kitchen operators.
Evidence: Production read-only 2026-08-19 (`enloyfnuerqgaqderbwb`): 1 open YCM (`partially_ordered`, ginseng 50 sets), 2 submitted YCH with received DCs, 0 PO without YCM. Plan section in `inventory_queue-first_84da3fb0.plan.md`.

- [ ] Wave 1 T3 RPC `create_purchase_order` (null YCM, grant `po_create` to central ops, fold Auto-GRN)
- [ ] Hide YCM create / allocate only after that RPC is Production-ready
- [ ] Wave 3 dest-initiated DC + BM `inventory:transfer_create` (separate)
- [ ] Wave 4 REVOKE write RPCs; Wave 5 soak then DROP FKs/tables

## POS/KDS operational audio no longer mix guest events

State: verify
Kind: fix
Tier: T2
Lane: pos
Exit: Open POS can tell QR self-order, staff call, payment call, and paid from each other and from KDS ticket beeps. One poll tick plays one guest alert. Staff call no longer shares the payment-call tone.
Evidence: `operational-audio.test.ts`, `self-order-cutover-static.test.ts`, `self-order-staff-call-static.test.ts`, `kds-sound-alerts.test.ts` green. Web `tsc --noEmit` green on owned files. `lint:copy` + ESLint on owned files green. Full `corepack pnpm verify` blocked by unrelated dirty-tree `packages/shared/src/messages/promotions.ts` (duplicate `emptyDescription`) and `docs/modules/finance.md` budget.

UI Advisor Gate
- Surface: `/br/[branchId]/pos` audio + KDS tone isolation; route family: station POS; plane: `station_chrome`; change: operational audio catalog
- Context: screen-context-map POS 2.1; actor: cashier on the open till; job: hear which QR guest event needs attention without confusing it for a kitchen ticket
- Journey: guest submits / calls staff / asks to pay / paid → one distinct POS beep+voice; kitchen send stays on KDS tones
- Information order: 1) payment call 2) self-order approval 3) staff call; exclude: durable notifications, Telegram
- Pattern: existing station audio; exemplar `pos-desktop-inner.tsx`; data display: none (device-local sound)
- States: audio off / beep / beep+voice; first poll seeds ids silent
- Block: `pos-board` — audio only, no layout compose
- Responsive: n/a
- Verification: unit + static tests; owned-file typecheck/lint green; repo `verify` blocked by unrelated dirty tree

- [ ] Cashier with beep+voice hears distinct copy for self-order, staff call, and payment

## POS/KDS voice uses cached cloud TTS then louder browser fallback

State: verify
Kind: feature
Tier: T2
Lane: pos
Exit: Beep stays immediate. Voice is cached AI Gateway `nova` clips through Web Audio at 1.15x. Clip miss stays silent. Free-form text cannot be synthesized.
Evidence: `operational-audio.test.ts` allowlist + `operational-audio-tts-static.test.ts`.

UI Advisor Gate
- Surface: POS/KDS operational audio; route family: station; plane: `station_chrome`; change: voice engine
- Context: screen-context-map POS 2.1 / KDS; actor: cashier/chef; job: hear catalog copy over kitchen noise
- Journey: enable beep+voice → preview prefetches phrases → live alert fetches during beep → play after 120 ms
- Information order: 1) beep 2) spoken kind+table; exclude: menu readouts
- Pattern: existing station audio; exemplar `operational-audio.ts`; data display: none
- States: cloud configured / unconfigured / timeout
- Block: `pos-board` — audio only
- Responsive: n/a
- Verification: unit + static tests

- [ ] Set `AI_GATEWAY_API_KEY` on Production and hear nova Vietnamese on POS beep+voice
- [ ] With key unset or clip miss, OS voice does not speak; beep still follows mode

## POS stores table voice clips; paid amounts speak on demand

State: verify
Kind: feature
Tier: T2
Lane: pos
Exit: Open POS with voice prefetches “Bàn {n} gọi món / cần duyệt đơn / gọi thanh toán / gọi nhân viên” for that branch’s tables. Paid speaks “Đã nhận {Vietnamese amount}” without prefetching every total.
Evidence: `operational-audio.test.ts`, `vnd-vietnamese-speech.test.ts`, `operational-audio-tts-static.test.ts` green. Web `tsc --noEmit` green on owned files. ESLint on owned files green. Full `corepack pnpm verify` not claimed.

UI Advisor Gate
- Surface: POS operational audio; route family: station POS; plane: `station_chrome`; change: voice catalog + amount speech
- Context: screen-context-map POS 2.1; actor: cashier; job: hear which table event fired, then hear the received total
- Journey: enable voice → prefetch table lines → QR event speaks stored table clip → paid speaks on-demand amount
- Information order: 1) table event 2) received amount; exclude: digit-by-digit totals, 1–99 blind prefetch
- Pattern: existing station audio; exemplar `operational-audio-catalog.ts`; data display: none
- States: table clip cached / amount miss / amount over 20M fallback
- Block: `pos-board` — audio only
- Responsive: n/a
- Verification: unit + static tests

- [ ] Voice mode on a branch with tables 3 and 12 stores those four table lines
- [ ] VietQR paying 165,000 at table 12 speaks “Đã nhận một trăm sáu mươi lăm nghìn thanh toán bàn 12”; cashier cash confirm stays silent

## Inventory screen contract and landing queue

State: doing
Kind: feature
Tier: T2
Lane: inventory
Exit: Every Inventory and Branch-stock `page.tsx` is listed in `docs/ref/screen-context-map.md` §2.5A with load / display / submit / current-vs-target. Control `/inventory` attention queue splits stock requests vs transfers and adds missing GRN unit-price. Catalog form and allocate 1-supplier drafts stay.
Evidence: Static landing attention + wave23 tests. `lint:copy`. Canvas `inventory-screens.canvas.tsx`.

UI Advisor Gate
- Surface: `/inventory` landing + `/inventory/purchase-orders` chrome; route family: control inventory; plane: `control_surface`; change: copy + attention queues
- Context: screen-context-map §2.5–2.5A; actor: owner / accountant / central; job: name the next warehouse document without mixing stock request and transfer
- Journey: open Inventory home → attention names the document → deep-link list; recovery: empty queue hides the row
- Information order: 1) open GRN 2) GRN missing unit price 3) stock request 4) transfer 5) waste; exclude: Finance AP, POS revenue
- Pattern: LANDING queue already on page; exemplar `apps/web/app/(protected)/inventory/page.tsx`; data display: Item list
- States: each queue 0 (hidden) vs >0
- Block: none — existing `AppSection` + `ItemGroup` on this LANDING
- Responsive: same IA, compact density
- Verification: static tests, `lint:copy`, typecheck/lint/web tests owned here

- [ ] Owner browse canvas + confirm next page family (fulfillment hub vs Branch doors)

## POS leftover cash counts on the paying till

State: verify
Kind: fix
Tier: T3
Lane: pos/finance
Exit: Completing payment on an order tagged to a closed POS session rebinds it to the open branch session; `expected_cash` uses completed cash `paid_at` in the till window. Closed historical variances are not restated.
Evidence: Static `pos-session-carry-forward-cash-static` test. SQL `pos_session_carry_forward_cash_test.sql`. Applied Production `20260818221238` on `enloyfnuerqgaqderbwb` (same batch: `20260818211203`, `20260818221612`, `20260818221613`). Open till at branch 3 now has 2 leftover cash bills / 196,000 VND rebound.
- [ ] Smoke: leftover unpaid from the previous shift, cash collected on the next shift, then close — variance is no longer equal to those carry-forward bills

## Prod 42703/23505: GRN draft price unit and kitchen ticket unique

State: verify
Kind: fix
Tier: T3
Lane: inventory/pos
Exit: Approving a purchase demand creates unpriced GRN drafts even when the ingredient has WAC/reference cost. Concurrent kitchen sends that collapse to the same `#NNN` retry with the daily ticket_seq instead of 409. Deploy already-fixed GRN select (no `unit_price_est`).
Evidence: Static GRN book-price + kitchen-ticket tests. SQL catalog proofs in `grn_book_unit_price_test.sql`, `purchase_demand_allocation_workflow_test.sql` (ingredient `unit_cost = 25000`), `kds_completion_print_contract_test.sql`. Applied Production `20260818221612` + `20260818221613`.
- [ ] Smoke: approving a purchase demand with a priced catalog ingredient succeeds; POS append during lunch does not 409 on kitchen ticket unique
- [ ] Deploy working-tree GRN detail select that dropped `purchase_order_items.unit_price_est`

## Expense period KPI sums the whole period

State: doing
Kind: fix
Tier: T3
Lane: finance
Exit: `/finance/expenses` `Chi vận hành` and `Cần xử lý` KPIs come from `get_finance_expense_period_summary` for the selected period/location, not the first 100 list rows. List stays paged.
Evidence: Static `finance-expenses` tests. SQL `finance_expense_period_summary_test.sql` (101 operating rows). Applied Production `20260818171912`. Types regenerated from Production.
- [ ] Smoke: period with >100 operating rows shows full `Chi vận hành`, not page-1 sum

## Free-item promotion kind for 5-star drink comps

State: verify
Kind: feature
Tier: T3
Lane: promotions/pos
Exit: Owner can publish a code-only `free_item` campaign; waiter/cashier with `pos:use` pick N units already on the bill; money lands on item VND discounts; no auto apply; kitchen qty unchanged.
Evidence: Isolated `corepack pnpm --filter @comtammatu/web exec node --import tsx --test tests/promotions-static.test.ts`, web typecheck, `lint:copy`, `lint:migration-lineage`, `lint:language-policy`, security-definer static tests green. Applied Production `20260818164309` and `20260818211203`.

- [ ] Smoke: create `5SAO` free 1 drink; POS code with one drink line auto-applies; two drink SKUs open the picker; clear promo before merge/split

UI Advisor Gate
- Surface: `/promotions` + `/br/[branchId]/pos` discount sheet; route family: control promotions / station POS; plane: `control_surface` + `station_chrome`; change: kind + picker copy
- Context: screen-context-map 2.4D + POS 2.1; actor: owner catalog, cashier/waiter redeem; job: staff-select N drinks on the bill after verifying 5-star
- Journey: Owner DOC-WORKFLOW kind `Tặng món trên đơn` → POS `Mã giảm` → picker if multiple lines → item VND; recovery: clear promo then re-enter code
- Information order: 1) campaign name/code 2) drink lines on bill 3) selected units / amount; exclude: Google review API, auto chip
- Pattern: existing DOC-WORKFLOW + StationSheet picker; exemplar `promotion-form.tsx` + `discount-sheet.tsx`; data display: document + station sheet
- States: draft/active campaign, preview needs pick, auto one-line, applied, cleared on ineligible cart
- Block: none — reuse StationSheet Item/Checkbox picker
- Responsive: Owner document; POS touch sheet
- Verification: static promotions tests, SQL helper/grant test, `lint:copy`, `lint:migration-lineage`

## Kept GRN qty amends PO

State: verify
Kind: feature
Tier: T3
Lane: inventory/procurement
Exit: Over-receipt raises `purchase_order_items.quantity` so `po_applied_quantity` equals kept qty; shortage close uses `close_purchase_order` (`closed`); warehouse `grn_confirm` or `po_approve` may close; UI copy is keep-and-raise PO qty / receive-again or close remainder.
Evidence: Isolated `corepack pnpm verify` green. Applied Production `20260818121714` then `20260818160643`.

- [ ] Smoke: over-receipt amends PO qty and invoice can bill kept qty; close remainder cancels draft GRN; `unit_cost = 0` still blocked

UI Advisor Gate
- Surface: `/inventory/grn` + `/inventory/purchase-orders`; route family: control inventory; plane: `control_surface` + central touch GRN; change: copy + flow
- Context: screen-context-map GRN; actor: warehouse/owner; job: book kept qty as PO truth
- Journey: confirm GRN with over-receipt → PO line qty rises; shortage → next Auto-GRN or close remainder; recovery: reason dialog
- Information order: 1) kept qty 2) GRN net unit price 3) shortage/excess outcome; exclude: PO money, VAT
- Pattern: existing LIST + document overlay / NumberPadSheet; exemplar GRN line row; data display: document
- States: draft over-receipt, draft shortage, confirmed received, PO closed
- Block: none — existing GRN pad and PO reason dialog
- Responsive: Owner overlay; central touch GRN
- Verification: SQL kept-qty + close remainder, static copy tests, `lint:copy`

## GRN books unit price; invoice is AP only

State: verify
Kind: feature
Tier: T3
Lane: inventory/valuation
Exit: PO has no `unit_price_est` / `line_total`; GRN accepted lines require net `Đơn giá` quoted in `unit_cost_unit_id`; confirm books converted value into company WAC; confirming a supplier invoice does not append `invoice_reprice` or change `Định mức/phần` / food cost.
Evidence: Isolated `corepack pnpm verify` green. Applied Production `20260818121714`. Types regenerated from Production.

- [ ] Smoke: GRN confirm without unit price blocked; carton quote + loose persist books converted total; supplier-invoice confirm leaves WAC unchanged

UI Advisor Gate
- Surface: `/inventory/grn/[id]` + branch GRN line sheet; route family: control inventory / branch stock; plane: `control_surface` + `branch`; change: copy + behavior
- Context: screen-context-map inventory GRN; actor: warehouse/owner; job: book receipt qty and net unit price in a named unit
- Journey: open draft GRN → enter qty + `Đơn giá` + price unit → confirm; invoice later is AP/VAT; recovery: toast `grn_unit_price_required` / `grn_unit_price_unit_required`
- Information order: 1) ingredient 2) qty + persist unit 3) `Đơn giá` + price unit 4) QC; exclude: VAT, PO estimate, finished goods
- Pattern: DOC-WORKFLOW existing; exemplar: `apps/web/app/(protected)/inventory/grn/[id]/views/grn-line-row.tsx`; data display: document line Field + MoneyVndInput + unit Select
- States: draft missing price, draft priced with quote unit, confirmed valued, invoice AP-only
- Block: none — existing GRN line Field + MoneyVndInput / NumberPadSheet + Select
- Responsive: Owner document dialog; branch AppSheet number pad
- Verification: SQL GRN price + carton-vs-pack book total, static GRN/PO tests, `lint:copy`

## Transfer receive must keep company WAC

State: verify
Kind: defect
Tier: T3
Lane: inventory/valuation
Exit: Operator can receive `DC-17082026-0049` at the oversold branch; `stock_transfer_receive` no longer writes negative `avg_unit_cost` when destination on-hand is negative and `unit_cost_at_ship` is lower than last WAC.
Evidence: Production `enloyfnuerqgaqderbwb` applied `20260818012917` 2026-08-18; catalog `company_wac_only`; slip `DC-17082026-0049` still `confirmed_receive`. Static tests green.

- [ ] Retry receive on `DC-17082026-0049`; dest WAC stays >= 0

UI Advisor Gate
- Surface: none (RPC-only; transfer receive UI unchanged)
- Block: none
- Verification: SQL catalog + oversold dest receive, static tests, `lint:migration-lineage`

## Requeue blocked invoice_total_mismatch jobs

State: verify
Kind: defect
Tier: T3
Lane: finance/hddt
Exit: Owner/accountant can confirm once on `/finance/invoices` to requeue every tenant job that is `blocked` with `invoice_total_mismatch` and a `draft` tax invoice; cron then issues them. `reconcile_required` and `provider_rejected` stay untouched.
Evidence: Isolated `corepack pnpm verify` green. Production `enloyfnuerqgaqderbwb` applied `20260817222103` + `20260817222910` 2026-08-17. Types regenerated. 113 mismatch jobs still `blocked` until web deploy + Owner click.

- [ ] After owner-delegated Production apply of `20260817222103` (same HĐĐT batch as `20260817222910`), then web deploy, confirm 113 jobs leave `blocked`.

UI Advisor Gate
- Surface: `/finance/invoices` attention banner; route family control finance; plane: `control_surface`; change: flow
- Context: screen-context-map Finance; actor: Owner/accountant; job: retry HĐĐT after whole-VND peel fix
- Journey: open invoices → see mismatch count → confirm → jobs queued; recovery: idempotent second click requeues 0
- Information order: 1) count 2) confirm that POS money is already collected 3) result toast; exclude: Viettel-unknown reconcile jobs
- Pattern: LIST existing; exemplar: `invoice-list.tsx` attention Item; data display: Item + confirm()
- States: idle, confirm, pending, success, empty, permission
- Block: none — existing attention Item + `confirm` + Button
- Responsive: banner button in ItemHeader; touch size via existing Button
- Verification: SQL ACL/functiondef test, static action/UI tests, `lint:copy`, isolated `corepack pnpm verify`

## Unstick leftover HĐĐT (date drafts + uuid collision)

State: verify
Kind: fix
Tier: T3
Lane: finance/hddt
Exit: 58 leftover signing invoices rebound to their Viettel originals; 58 misbound orders get new drafts queued with `allowBacklogSubmitDate`; 80 date-blocked drafts requeued the same way; paid `TC-260816-067-NHT` leaves `pending_payment`. New invoices still fail-close when the sale VN day is past. Same-day sales still send `paid_at`. Buyer window is `paid_at` from 22:00 VN, else `min(paid_at + 2h, 23:55 VN)`.
Evidence: Production applied `20260818101813`, `20260818161136`, `20260818224935` after dry-run matched those files only. 58 leftovers `issued`; 58 stolen cancelled locally; 139 jobs flagged `allowBacklogSubmitDate` (80+58+1); `TC-260816-067-NHT` job queued on payment 482.

- [ ] Cron issues 80 date leftovers + 58 cloned misbound drafts + `TC-260816-067-NHT`; leftover 58 already `issued` after SQL

UI Advisor Gate
- Surface: `/finance/invoices`; route family: control finance; plane: `control_surface`; change: copy
- Context: screen-context-map Finance HĐĐT queue; actor: Owner/Accountant; job: retry same-day drafts, reconcile unknown Viettel
- Journey: open LIST attention → read error → requeue mismatch/date-blocked drafts or Viettel reconcile; recovery: toast, no second create
- Information order: 1) attention jobs 2) date/error 3) requeue or reconcile; exclude: second Viettel create
- Pattern: LIST existing; exemplar: `invoice-list.tsx`; data display: attention Item
- States: queued, blocked, reconcile_required, issued
- Block: none — existing attention banner copy only
- Responsive/accessibility: same banner; confirm dialog labelled
- Verification: SQL helper math, `resolveSinvoiceIssuedAt` tests, static issuer tests, `lint:copy`

## Backfill sale consumption after today's recipe add

State: verify
Kind: fix
Tier: T3
Lane: inventory/finance
Exit: Paid sales-CN orders consume newly added recipe ingredients (cups, takeaway pack, crackling); `/finance` MTD food cost is a number, not missing-data; already-posted ingredients are not deducted twice.
Evidence: Production `enloyfnuerqgaqderbwb` applied `20260817200004`. MTD coverage 753/753. Today's recipe ingredients have zero missing sale_consumption. Order 29 posted 2 cups at 613. Branch crackling on-hand is negative pending transfer.

- [ ] Owner reload `/finance` MTD and confirm food cost shows a number

UI Advisor Gate
- Surface: none (ledger backfill; `/finance` landing copy unchanged)
- Block: none
- Verification: SQL + static tests, then Production apply proof

## Redo bank LIST match for accountants

State: verify
Kind: feature
Tier: T2
Lane: finance
Exit: `/finance/bank-transactions` date column shows date + `HH:MM:SS`; status and processing are one clickable `Chưa khớp` badge that opens `AppSheet`; money-in match searches `mã đơn`; money-out sheet is compact.
Evidence: Shared `formatVNTimeSeconds` unit test; sepay-bank / cash-deposit / command-dashboard static tests green; `@comtammatu/web` tsc green; `lint:copy` green; eslint on changed bank files green.

- [ ] Authenticated smoke: tap `Chưa khớp` → search `mã đơn` → confirm; money-out sheet stays compact

UI Advisor Gate
- Surface: `/finance/bank-transactions`; route family: control finance; plane: `control_surface`; change: visual + flow
- Context: screen-context-map Finance; actor: Owner/Kế toán; job: classify unmatched bank rows
- Journey: open LIST → read date+time → tap `Chưa khớp` → search `mã đơn` or pick `chứng từ` → confirm; recovery: toast + keep sheet open
- Information order: 1) date/time 2) amount 3) content 4) status-as-action; exclude: payment_code as the primary accountant input
- Pattern: LIST; exemplar: `apps/web/app/(protected)/finance/bank-transactions/page.tsx`; data display: DataTable
- States: unmatched, matched, webhook_error, missing_webhook, search empty
- Block: none — LIST + AppSheet D1 beside the table; no new UI block
- Responsive/accessibility: same IA; badge is a button with `aria-haspopup`; primary viewport Owner desktop, cards below 1024
- Verification: static tests, `lint:copy`, targeted web tests

## Finished goods are recipe-produced only

State: verify
Kind: feature
Tier: T3
Lane: inventory/catalog
Exit: `finished_good` is only a kitchen-produced SKU with a production recipe; purchased bottles/lids stay `raw_material`; PO/YCM/GRN/NCC cannot add FG; YCH/transfer of FG still allowed.
Evidence: Applied Production `enloyfnuerqgaqderbwb` 2026-08-17 with `20260817191830` (owner-authorized batch). Coca/Fanta/Sprite/bottled water/PET lids are `raw_material`. Remaining `finished_good` rows all have a production recipe spec. Zero active FG `supplier_items`. Four purchase-line triggers live. Types regenerated (`repair_company_wac_valuation` now in generated RPC types).

- [ ] Smoke: PO/YCM/GRN/NCC pickers omit FG; YCH still lists kitchen FG.

UI Advisor Gate
- Surface: ingredient dialog + PO/YCM/GRN/NCC pickers; plane: `control_surface`; change: copy + picker filter
- Context: screen-context-map inventory; actor: warehouse/owner; job: buy ingredients, produce FG
- Journey: create SKU → purchased vs produced; PO/GRN/NCC pickers show purchased only; recovery: DB `finished_good_not_purchased`
- Information order: 1) kind 2) recipe requirement; exclude: purchased bottles/lids as FG
- Pattern: FORM existing; exemplar: `ingredient-dialog.tsx`
- States: raw_material, finished_good
- Block: none
- Responsive/accessibility: same switch + FieldDescription
- Verification: SQL + static tests, `lint:copy`, `corepack pnpm verify`

## Company WAC and cost restatement

State: verify
Kind: feature
Tier: T3
Lane: inventory/valuation
Exit: Pending GRN uses last-invoice/WAC provisional so site WAC does not collapse to 0; purchased SKUs share one company WAC; finished goods skip GRN and share one production WAC after transfer; production output equals consumed input value; owner-only `repair_company_wac_valuation` restates without rewriting movement snapshots.
Evidence: ADR 0040 + glossary/inventory copy; migration `20260817183130_company_wac_and_cost_restatement.sql` applied on Production `enloyfnuerqgaqderbwb` 2026-08-17; SQL + static tests. Scoped 17 Aug restatement `20260817201330` (one-gang raw meat and finished good only): origin 2125 provisional 2982000 VND; FG WAC 51611 VND/portion; 13 sold portions food_cost 51611 VND. Remaining: other 17 Aug pending invoices, then company-wide `repair_company_wac_valuation`.

- [ ] Confirm remaining 17 Aug pending invoices (chop, spare-rib, produce), then `repair_company_wac_valuation` dry-run then apply.

UI Advisor Gate
- Surface: inventory stock/issue/transfer + GRN pending hint; plane: `control_surface`; change: copy
- Context: screen-context-map inventory; actor: warehouse/owner; job: read one company cost
- Journey: open stock/document → one company WAC; GRN confirmed pending → provisional hint; recovery: supplier invoice then repair RPC
- Information order: 1) qty 2) company WAC 3) invoice pending; exclude: dual Central Supply vs branch prices
- Pattern: LIST/DETAIL existing; exemplar: `stock-client.tsx`
- States: valued, pending invoice, missing provisional
- Block: none
- Responsive/accessibility: same columns
- Verification: static copy tests, SQL valuation test, `corepack pnpm verify`

## Split opening capital from monthly operating expense

State: verify
Kind: feature
Tier: T3
Lane: finance
Exit: `/finance` shows the opening-capital card after period result and outside the P&L formula; operating expense excludes `capital`/`deposit`; migration CHECK + RPC allowlist + backfill exist and are applied on Production.
Evidence: Targeted finance tests green; `@comtammatu/web` typecheck + eslint green; `lint:copy` / `lint:language-policy` / `lint:migration-lineage` / `lint:docs-budget` green. Production apply `enloyfnuerqgaqderbwb` 2026-08-17: `20260817181500` + `20260817183130` (owner-authorized batch). CHECK includes `capital`/`deposit`; NHT sample `#37` rent, `#20`/`#67` deposit, `#42`/`#57`/`#58`/`#59` capital. Full `corepack pnpm verify` blocked by unrelated dirty `food-cost-client.tsx` `gap-0.5`.

- [ ] `corepack pnpm verify` (blocked by unrelated food-cost UI contract hit)

UI Advisor Gate
- Surface: `/finance` + `/finance/expenses`; route family: control finance; plane: `control_surface`; change: visual + copy
- Context: screen-context-map Finance Basic; actor: Owner/Accountant; job: see shop opening capital vs monthly opex
- Journey: open `/finance` → period formula (opex only) → opening-capital card → funds; recovery: drill to `/finance/expenses`
- Information order: 1) period result 2) cumulative opening capital 3) funds; exclude: depreciation, deductible VAT, net profit
- Pattern: DASHBOARD_REPORT on `/finance`; LIST on `/finance/expenses` with `KpiRow` above `AppListFrame` (not REPORT compose). Exemplar: `food-cost-client.tsx` KPI strip + `expenses-client.tsx` LIST frame; data display: KpiCard
- States: recorded / not_recorded
- Block: none — reuse `KpiCard` / `AppSection` / `KpiRow`; no new formula operators
- Responsive/accessibility: same compact KpiRow as inventory/VAT
- Verification: static finance tests, `lint:copy`, `corepack pnpm verify`

## Compact floor shift tasks and require photo evidence

State: verify
Kind: feature
Tier: T3
Lane: hr/self-service
Exit: Each floor position has 3–5 start/end-of-shift tasks; photo tasks cannot be marked done without `photo_path`; waiter has no cash close; open unchecked-out checklists refresh to the new templates.
Evidence: Migration `20260817191830_compact_position_shift_tasks_photo_required.sql` on Production `enloyfnuerqgaqderbwb`; live templates are 3–5 tasks/position; CHECK `attendance_checklist_items_photo_required_when_done` exists; static tests green. Full `corepack pnpm verify` blocked by unrelated bank LIST UI-contract hits.

- [ ] Smoke: photo task rejects tick without photo; capture marks done; waiter list has no cash close.

UI Advisor Gate
- Surface: `/br/[branchId]/shift` (`Việc trong ca`); route family Branch personal day-flow; plane: `branch` / `staff`; change: copy + data
- Context: screen-context-map §2.4A; actor: cashier/chef/branch_staff/BM/guard; job: complete short shift tasks with photo proof
- Journey: clock-in → 3–5 start/end rows → camera completes photo task → checkout; recovery: retake if camera denied
- Information order: 1) phase 2) title 3) photo hint; exclude: uniform/clock-in/stock-report rows, waiter cash close
- Pattern: LANDING; exemplar: `apps/web/lib/staff-runtime/tasks/tasks-client.tsx`; data display: Item list
- States: todo, photo required, done
- Block: none — existing task list; no layout compose
- Responsive/accessibility: phone primary; camera button labeled
- Verification: static seed + CHECK tests, `lint:copy`, `corepack pnpm verify`

## GRN partial, over-receipt, pack+loose units

State: verify
Kind: feature
Tier: T3
Lane: inventory/procurement
Exit: Partial receipt still allowed; over-receipt (gifts/extras) stocks at cost 0 instead of blocking confirm; warehouse staff can enter pack + loose units on one PO line; persist in the loose unit; remaining/apply compared in base.
Evidence: Migration `20260817122500_grn_receive_base_qty_and_excess.sql` applied on Production `enloyfnuerqgaqderbwb` 2026-08-17 (batch with shift-task photo). Catalog: confirm compares remaining in base via `inv_to_base`. Types unchanged. Model + static tests; `lint:copy`; `corepack pnpm verify` green 2026-08-17.

- [ ] Confirm Meizan draft `GRN-13082026-0055` (6 vs PO 4).
- [ ] Smoke pack+loose: PO 10 pack units, GRN 9+6 → `partially_received`; 10+6 → `received` with 6 loose units at cost 0.

UI Advisor Gate
- Surface: `/inventory/grn` document overlay + branch `/br/…/stock/grn/[id]` review; plane `control_surface` / `branch`; change: flow
- Context: screen-context-map §2.6; actor: warehouse receiving; job: record physical receipt per delivery
- Journey: Auto-GRN → pack+loose (or one field) → shortage/excess badge → confirm; recovery: next draft if shortage
- Information order: ordered qty (pack+loose) → accepted qty → rejected → applied/shortage/excess; exclude: purchase price
- Pattern: DETAIL/DOC existing GRN; exemplar `grn-line-row.tsx`
- States: draft edit, shortage, excess (warning, not block), QC reject, confirm
- Block: none — extend existing line row / draft card / branch line sheet
- Responsive: same two fields on desktop table and mobile card
- Verification: targeted GRN/model/SQL tests, `lint:copy`, `lint:ui-contract`, then `corepack pnpm verify`

## Control Surface layout rebuild (chrome, nav, compose)

State: verify
Kind: feature
Tier: T2
Lane: control-surface/layout
Exit: Control Surface uses one chrome at three densities (tablet inherits phone IA, shell 1024), restored inventory nav groups, four mobile work slots (stock / inbound / transfer / production), LIST/home compose without KPI mosaics or a full `fetchFinanceCockpit` on `/`, `/me` on Employee* adapters, `/notifications` chrome-less per design-system A.7, and Control overlays limited to FormDialog / AppDialog document / AppSheet D1. No new design system, tokens, Owner* kits, or AppDetailFrame. DataTable presentation cut stays 1024 unless the owner explicitly forks tablet tables at 768.
Evidence: WP0–WP10 landed in product code. Implementation canvas `control-surface-layout-implementation.canvas.tsx`; diagnosis + IA in `control-surface-layout-rebuild.canvas.tsx`; compose/overlay/data contracts in `control-surface-compose-wireframes.canvas.tsx`. `lint:copy`, `lint:ui-contract`, and `corepack pnpm verify` green after the last product edit. WP11 (DataTable 768) was not implemented.

- [ ] Owner smoke: phone inventory bottom nav is stock / inbound / transfer / production; desktop catalog cluster is collapsed; `/` does not pull the full finance cockpit; `/orders` LIST has no KPI mosaic; `/notifications` has no AppShell.

UI Advisor Gate
- Surface: Control Surface shell + primary tabs / deep nav / bottom nav; routes `/`, `/orders`, `/inventory`, `/me`, `/notifications`; plane: `control_surface`; change: layout
- Context: screen-context-map Control Surface; actor: owner/ops on L0; job: navigate and complete LIST/DOC work without competing chrome
- Journey: open Control → module tab → deep work (or modules drawer on phone) → list/filter → overlay D1 when needed; recovery: in-page back on chrome-less `/notifications`
- Information order: 1) scope + title 2) work 3) at most one list filter 4) bottom nav; exclude: Branch/station chrome, KPI mosaic on LIST/home, Ctrl+K
- Pattern: mixed LIST / LANDING / STAFF_EMBED / chrome-less notifications; exemplar: GRN list + settings AppLinkCard + EmployeePage
- States: loading, empty, permission, overlay D1, modules drawer
- Block: `app-shell` / `control-surface-nav` / `AppListFrame` / `FormDialog`; components: existing App* / Employee* only; fallback: none — no second DS
- Responsive/accessibility: one H1, max two sticky bands on phone; tablet uses phone IA until 1024; DataTable cards below 1024 unless owner forks
- Verification: `lint:ui-contract`, `lint:copy`, targeted control-surface tests, then `corepack pnpm verify`

## POS convert completed cash orders to VietQR

State: verify
Kind: feature
Tier: T3
Lane: pos/payment
Exit: From POS `Đơn hoàn thành`, a cashier can convert a paid cash order to VietQR, stamp a payment code, and print the VietQR receipt; money remains on `payments.method` with closed-session cash recalc.
Evidence: RPC `pos_convert_cash_payment_to_vietqr` applied on Production `enloyfnuerqgaqderbwb`; `20260816113818_receipt_print_vietqr_for_paid_orders.sql` applied (ledger `20260816113818`); `corepack pnpm db:types` (no generated-type diff); advisors only the pre-existing `enqueue_receipt_print` SECURITY DEFINER grant; `corepack pnpm verify` green on the print-render + trigger fix.

- [ ] Reload POS, convert one paid cash order in completed orders, and confirm the VietQR slip has a scannable transfer QR.
- [ ] Confirm dialog appears on Convert to VietQR (button must not spin until after confirm).

UI Advisor Gate
- Surface: `/br/[branchId]/pos` completed-order sheet + receipt; route family station POS; plane: `station_chrome`; change: flow
- Context: screen-context-map §2.1 POS; actor: cashier (`pos:confirm_payment`); job: reclassify cash → VietQR and print QR
- Journey: open `Đơn hoàn thành` → cash paid row or receipt → confirm → convert + print; recovery: reprint / Finance bidirectional correction
- Information order: 1) completed list 2) bill amount + current method 3) convert/print; exclude: Finance vietqr→cash
- Pattern: BOARD; exemplar: `apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx`; data display: station list + StationSheet
- States: loading, empty, confirm, pending, success, print failsoft, permission, vietqr unconfigured
- Block: `pos-board`; components: `StationSheet`, `Button`, `confirm` dialog; fallback: receipt sheet actions
- Responsive/accessibility: touch targets; labels on convert/print; keyboard via confirm dialog
- Verification: static contract tests; `corepack pnpm verify` after implementation

## Redesign promotions create + apply (free side)

State: verify
Kind: feature
Tier: T3
Lane: promotions/pos
Exit: Owner creates any promo kind via kind-first DOC-WORKFLOW; cashiers/waiters apply codes and complete free-side selection; auto free-side offers appear without code; money lands on existing discount columns (ADR 0034); `corepack pnpm verify` green after Owner Accept of this design.
Evidence: Amended ADR 0039 / module / screen-map; migration `20260814114800_promotion_free_side.sql` applied on Production `enloyfnuerqgaqderbwb`; `corepack pnpm db:types`; Owner form + POS flow; `promotions-static` 4/4; `corepack pnpm verify` green.

- [ ] Live smoke: Owner create free_side (Com suon buy + Bi/Cha/Trung get, N=1, Code+Auto) -> POS code pick side -> auto offer chip pick side.

## Fix paid-receipt reprint and VAT-inclusive bill print

State: verify
Kind: defect
Tier: T3
Lane: pos/print
Exit: Cashier reprint of a paid receipt reaches the branch agent; provisional bill and payment receipt print menu line amounts and subtotal as VAT-inclusive, omit GTGT rate lines, then service/discount and grand total as the payable amount.
Evidence: print-agent UPDATE + always-on pending drain; print-render VAT-inclusive subtotal; POS print/reprint permission OR-gate; `corepack pnpm verify`.

- [ ] Redeploy print-agent 1.0.4 at Nguyen Huu Tho and reprint one paid receipt.
- [ ] Print one provisional bill and one payment receipt; confirm line amounts/subtotal are VAT-inclusive and grand total applies service/discount only.

## Close inventory RPC and loader cleanup

State: verify
Kind: defect
Tier: T3
Lane: inventory/procurement
Exit: Owner `/inventory/purchase-orders` (no branch filter) no longer times out; dead PO-first/GRN-draft/stocktake actions are gone; inventory RLS permission checks are initplan-wrapped; orphan inventory RPCs are dropped after a 6-channel scan; remaining nested list loaders are flattened and YCH deep links use `/inventory/transfers?requestId=`.
Evidence: Flattened purchase workspace loader; `includeUnits: false` plus companion units on PO/YCM pages; dead-action deletions; RLS wrap + DROP applied on Production `20260813142100` / `20260813142200`; `corepack pnpm db:types`; `corepack pnpm verify`.

- [ ] Owner smoke `/inventory/purchase-orders` unfiltered and one GRN confirm path.

## Ship notification attention on Control Surface

State: verify
Kind: feature
Tier: T2
Lane: notifications/attention
Exit: Owner control-surface routes show Sonner on a visible tab and OS popup when the tab is hidden; bell peek works on desktop Popover / mobile Sheet; `/notifications` is a LIST feed with device permission in the toolbar.
Evidence: `NotificationAttentionRuntime` mounted once from `ControlSurfaceShell`; `useForegroundNotifications` removed from `PwaRuntimeProvider`.

- [ ] Mount one attention runtime for every `(protected)` route and keep POS/KDS popup-only.
- [ ] Ship compact bell peek without colliding the full-page Realtime topic.
- [ ] Move device notification settings onto the `/notifications` LIST toolbar.

## Prove one money day on Production

State: blocked
Kind: defect
Tier: T3
Lane: pos/operational-truth
Exit: On Production, one cash order and one VietQR order show the same completed-payment money and `paid_at` day on `/orders`, Branch POS session, and `/finance/revenue`; KDS/print quantities remain separately named when kitchen evidence is in scope.
Evidence: Fund opening exists on Production; Branch 3 sellable catalog and tables empty (`menu_items=0`) — no POS order until seed + POS credential.
Blocker: Owner-only — seed Branch 3 (`Nguyễn Hữu Thọ`) catalog + tables; set VietQR payment settings + deployed `SEPAY_WEBHOOK_SECRET`; operate POS with owner/cashier login the agent does not hold.

- [ ] Seed the Branch 3 sellable catalog and tables, then confirm `menu_items > 0` before attempting POS.
- [ ] Place one completed cash order and one completed VietQR order on Branch 3 after the fund opening.
- [ ] Capture `/orders`, POS session, and `/finance/revenue` for the same Vietnam `paid_at` day and confirm totals match.
- [ ] If selling category `Khác` (Other), map its kitchen printer before treating slip mismatch as a money bug.

## Verify the current Inventory topology

State: blocked
Kind: qa
Tier: T3
Lane: inventory/topology
Exit: Every active site has exactly one active warehouse; GRN remains central-only, Branch receives transfer, and the authenticated Owner/Branch Inventory journeys pass at `390`, `768`, and `1280`.
Evidence: Migrations, database types, Inventory contract tests, Production catalog checks, repository gates; topology sites = `Kho Tổng` + `Bếp Trung Tâm` + NHT (one selling branch).
Blocker: Authenticated live smoke at `390` / `768` / `1280` needs an owner-delegated Production Owner or Branch Manager credential (ephemeral QA accounts deleted 2026-08-10).

- [ ] Run authenticated Owner/Branch Inventory smoke at `390`, `768`, and `1280`, then remove this outcome when every Exit item is evidenced.

## Ship INV-10 suggested editable request quantity

State: verify
Kind: feature
Tier: T2
Lane: inventory/requests
Exit: Choosing an ingredient on stock-request and purchase-request editors prefills an editable quantity from `max(0, min_stock_level - current_quantity)` (base unit for stock requests; default pack for purchase requests).
Evidence: `suggested-order-qty.ts`, request/purchase loaders, editor `chooseIngredient` prefill, unit test; Branch 3 YCH smoke (`Gạo` prefill then cancel) during `[QA-SMOKE-20260810]`.

- [ ] Smoke prefill on one purchase-request editor after login (needs Production credential; ephemeral QA accounts deleted).

## Decide inventory valuation cutover and POS stock flag go-live

State: blocked
Kind: qa
Tier: T3
Lane: inventory/valuation
Exit: The owner has answered the open questions below, and the answers are recorded in the owning doc or a design ADR — not in this entry — so cutover activation and the `pos_stock_outcome_posting` go-live can be planned as normal work.
Evidence: Owner workshop outcome; `apps/web/lib/finance/finance-cockpit.ts:203` and `apps/web/lib/finance/expense-actions.ts:568` gate food cost on cutover `status === 'active'`; `prepare_/activate_inventory_valuation_cutover` are `GRANT … TO service_role` only with no UI (`supabase/migrations/20260802162900_baseline.sql:89302-89303`).
Blocker: Owner-only — needs investigation and discussion before any decision. Explicitly parked, not deferred by the agent. Do not write an Accepted ADR for this until the workshop happens.

Open questions for the workshop:

- What does "valuation cutover" mean in operations language, stated without accounting vocabulary?
- Which business date is the cutover day, and what happens to movements before it?
- Who produces the opening stock quantities and unit costs, and how are they verified before activation?
- Should food-cost screens be visible before activation (showing that they are inert), or stay hidden until cutover is active?
- How does activation relate to the `pos_stock_outcome_posting` branch flag: flipped at the same moment, staged per branch afterwards, or independent?
- Reconciliation only iterates tenants that already have a cutover row, and its results have no screen (INV-14). Does the output need a surface, or does it reach the owner through an existing notification?

- [ ] Hold the owner workshop, then record the answers in `docs/ref/inventory.md` / `docs/modules/finance.md` or a design ADR and delete this entry.

## Remove compatibility payment writes

State: blocked
Kind: release
Tier: T3
Lane: finance/payments
Exit: Legacy `create_supplier_payment` and authenticated direct `payments` UPDATE are absent; owner-operated Preview schema/type/advisor gates pass; the separately owner-delegated Production apply and smoke are evidenced.
Evidence: Required-key proof from the preceding outcome, catalog/ACL checks, generated-type no-diff, repository gates, advisors, and explicit Production apply/smoke evidence.
Blocker: Production baseline still exposes legacy `create_supplier_payment` to `authenticated` and `GRANT … UPDATE ON public.payments TO authenticated` — drop only after owner-authorized required-key runtime proof.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.

## Prove Work module pilot smoke

State: verify
Kind: feature
Tier: T2
Lane: work/control-surface
Exit: Owner member can open Inbox and task DETAIL; a user without membership is denied; 7-day `Văn phòng` pilot has no RLS leak.
Evidence: `work_*` migrations + types; ACL `work`; nav `Công việc`; Inbox/Board/Calendar/Timeline UI; control-home `work:mine-due`; `/me` CTA; static + pgTAP; runbook `docs/runbooks/work-module-pilot-rollback.md`. ADR 0033 / screen-map `/work` Accepted.
Pilot department seed label: **`Van phong`** (product UI keeps the Vietnamese label).

- [ ] Smoke Inbox as Owner member and deny path for a user without membership; 7-day pilot watch.

## Work UI compose redesign (ADR 0035)

State: verify
Kind: feature
Tier: T2
Lane: work/control-surface
Exit: Owner adds a Van phong member who then opens `/work`; create CTA + DETAIL StatusBadge + inline toolbar filters pass manual smoke.
Evidence: ADR 0035 Accepted; W-UI-4..3 app code; Production migration `20260812140000_work_department_membership_admin.sql` applied; `db:types` regenerated; work-module-static green; RPCs verified on Production.

- [ ] Manual exit: add Van phong member via `/work/team` → that user opens `/work`.

## Burn down frozen Má Tư DS debt

State: doing
Kind: debt
Tier: T3
Lane: design-system/enforcement
Exit: Every frozen budget below trends down by removing allowlist entries (ratchet only fails on growth, so burned files may be dropped); the 40 `tune` pages reach `keep`/`final` disposition through the three exemplar waves. Never raise a budget; new files start at 0.
Evidence: `scripts/check-ui-contract.mjs` `legacy-debt-ratchet` guards (frozen 2026-08-13); `corepack pnpm audit:ui-components` Page Disposition Coverage; exemplar fixes in `finance/components/filter-bar.tsx`, `team/team-workspace-tabs.tsx`, `work/_lib/compose-styles.ts`, and the icon-tier batch.

Frozen debt per guard (burn down to zero):

| guard | frozen hits | files |
| --- | --- | --- |
| `arbitrary-dimension` | 85 | 53 |
| `presentation-inline-style` | 13 | 7 |
| `font-bold-lock` | 26 | 15 |
| `hex-literal-app` | 15 | 2 |
| `off-tier-radius-app` | 6 | 1 (ds-lab tier demo — keep until ds-lab cleanup) |
| `icon-size-tier` | 0 | 0 |
| `chrome-class-constant` | 0 | 0 |

`audit:ui-components` tune pages (40) in three waves, each anchored to an Exemplar Matrix exemplar:

- [ ] Wave 1 — control_surface LIST/DETAIL pages follow `apps/web/app/(protected)/inventory/grn/page.tsx`. Burned so far: `inventory/production/new/production-new-client.tsx` (4 hits → flex + `max-w-44`/`w-22` named scale) and the `font-bold` → `font-semibold` batch (`finance/revenue/[date]/revenue-drill-tabs.tsx`, `finance/revenue/revenue-client.tsx`, `components/form/photo-upload-input.tsx`).
- [ ] Wave 2 — branch `(operator)` pages follow `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx`.
- [ ] Wave 3 — station plane pages follow `apps/web/app/(protected)/br/[branchId]/kds/page.tsx`; spot-check light + dark at the station viewport.

