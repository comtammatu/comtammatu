# Inventory UX Research & Roadmap

> **Status:** Accepted for implement · 2026-08-11  
> **Scope:** Control Surface `/inventory/*` (Branch touch stays separate presenters)  
> **Gold bar:** `stock/stock-detail-dialog.tsx`, PO document body, GRN document KPI strip

## 1. Goal

Give Owner / Kế toán / Kho Tổng / Bếp TT a coherent ops experience across
procurement, receiving, fulfillment, shrinkage, production, and stocktake —
same Má Tư Design System density as stock/PO/GRN, without merging job surfaces
or inventing a second design language.

## 2. Personas (from screen-context §2.5–2.7)

| Actor | Jobs on control_surface |
| --- | --- |
| Owner | Full inventory + catalog + settings |
| Accountant | PO pricing/send + GRN visibility; AP on Finance |
| central_supply_ops | Demand, GRN, stock, transfers, consumption |
| central_kitchen_lead | Demand, production, transfers (YCH), stock |
| Branch roles | `/br/…/stock/*` touch plane only |

## 3. Journey map

```text
Hub → Tồn → (YCH/DC | Tiêu hao/Hao)
    → Mua hàng (YCM→PO) → GRN → Finance HĐ NCC
    → Giao nhận (YCH/DC hub)
    → Sản xuất → optional DC
    → Kiểm kê / phiếu đếm (discoverability gap)
    → Master (NL / NCC / CT / settings)
```

| Journey | Happy path | Chrome baseline (2026-08-11) |
| --- | --- | --- |
| Procurement | YCM → allocate → PO → GRN → HĐ NCC | Dense PO/GRN; Demand thinner until Wave 1 |
| Stock control | On-hand → thẻ kho dialog | Dense dialog; page twin thinner (Wave 3) |
| Fulfillment | Hub → transfer/YCH document | Wave 1 densify |
| Shrinkage | Consumption → waste/issue detail | Wave 1 densify issue DETAIL |
| Production | List → run detail | Wave 2 |
| Stocktake | Session → blind count → reconcile | Wave 2 + nav |
| Catalog | LIST + FormDialog | Keep archetype (not document gold bar) |

## 4. Industry principles (research summary)

Sources: hospitality multi-location inventory workflows, Foxtrot mobile
receiving, Chick-fil-A scanner UX, Supy multi-site GRN, ERP dock receiving.

| Principle | Application here |
| --- | --- |
| Exception-first receiving | Keep GRN reject + list/document KPI ngoại lệ |
| Three-way match | Qty on GRN; price/AP on Finance — clear handoff CTA (Wave 3) |
| Job-scoped surfaces | Do not merge PO + GRN + AP into one workspace |
| Location via URL/JWT | Meta KPIs respect selected site scope |
| Blind / focus task | Stocktake count wizard stays task-first; DETAIL gets KPI strip |
| Traceability | Density does not remove audit tabs |
| Discoverability | Hub attention + nav for stocktake/count/reports (Wave 2) |

## 5. Gold bar (compose recipe)

Reuse stock/PO/GRN only:

1. List: `AppPageHeader meta` + toolbar `Badge n/total` + attention when exceptions  
2. Document: title = code + `StatusBadge`; description = identity  
3. Body: `Item outline` KPI grid → `h4` + count hint → line `Item`s / DataTable  
4. Footer: Close → secondary → one primary  
5. Handoff: honest `returnTo` / `tab=` / entity query keys  

## 6. Density matrix

| Surface | Density target |
| --- | --- |
| Stock dialog, PO doc, GRN doc | **Done** (gold) |
| Giao nhận hub + transfer/YCH doc | **Done** (Wave 1) |
| Demand view dialog | **Done** (Wave 1) |
| Issue / consumption DETAIL | **Done** (Wave 1) |
| Production DETAIL, stocktake DETAIL | **Done** (Wave 2) |
| Hub attention + Kiểm kê nav | **Done** (Wave 2) |
| Stock page twin, GRN→AP CTA | **Done** (Wave 3) |

## 7. Implementation waves

### Wave 0 — This document + screen-context pointer

### Wave 1 — Daily ops density

- Giao nhận: hub meta + dialog StatusBadge; transfer detail KPI strip; YCH
  overview densify in `stock-request-detail-view` / fulfill page header  
- Demand: `purchase-request-view-dialog` KPI + StatusBadge title  
- Issue DETAIL: KPI strip before overview  

### Wave 2 — Production, stocktake, discoverability

- Production + stocktake DETAIL gold bar  
- `/inventory` hub attention deep-links  
- Nav: Kiểm kê (and reports if product Accept)  

### Wave 3 — Parity & handoff

- Align `/inventory/stock/[ingredientId]` with dialog  
- Stronger GRN → Finance invoice CTA when permitted  
- Waste create densify only if still sparse  

## 8. Out of scope

- Merge PO/GRN/AP IA  
- Branch touch redesign / importing control_surface presenters  
- Hardware scan / ASN  
- New page archetypes  

## 9. Verify

Static KPI/title contracts, `lint:copy` for new VI, typecheck/lint on touched
files, phone + desktop Owner primary viewport.
