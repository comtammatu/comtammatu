# Inventory matu-platform prod import acceptance - 2026-06-23

## Scope

This worklog records the post-merge/prod acceptance state for the `matu-platform`
Inventory import into `comtammatu`.

- PR: #112
- Merge commit: `93a4d7883653e587ccb240aa3a53c1be6d6341f1`
- Reconciliation report:
  `apps/web/output/inventory-reconciliation-2026-06-23/reconciliation-after-merge.md`
- JSON evidence:
  `apps/web/output/inventory-reconciliation-2026-06-23/reconciliation-after-merge.json`

## Accepted target ledger

The target ledger is internally consistent for the imported snapshot.

| Check | Value |
| --- | ---: |
| Reconciliation status | ok |
| Failures | 0 |
| Target stock transfers | 361 |
| Target transfer items | 582 |
| Target stock movement rows | 3717 |
| Sale consumption movements | 357 |
| Sale consumption cost | 211098981.49 |
| Stock levels | 124 |
| Stock value | 83309635.09 |
| Active kitchen locations | 0 |
| Kitchen stock levels | 0 |
| Negative stock levels | 0 |
| Stock level mismatches | 0 |
| Finance mirror missing cost rows | 0 |
| Finance mirror zero cost rows | 0 |

Sale consumption spans `2026-05-19` through `2026-06-23`.

| Branch | Imported sale consumption cost | Rows |
| --- | ---: | ---: |
| DD / Dat Do | 32396576.55 | 110 |
| PH / Phuoc Hai | 178702404.98 | 223 |

## Current source drift

The reconciliation also compares the accepted target ledger against the current
`matu-platform` source at report time. `matu-platform` has new source documents
after the imported snapshot, so the current source plan is larger than target.

| Metric | Current source plan | Target |
| --- | ---: | ---: |
| Real transfers | 362 | 361 |
| Transfer items | 583 | 582 |
| Stock movement rows | 3721 | 3717 |
| Sale consumption rows | 357 | 357 |
| Sale consumption cost | 211098981.49 | 211098981.49 |

New current-source documents observed after the snapshot:

- `TRF-20260623-001164`: `Kho Tong -> Phuoc Hai`, `Trung`, `90 trai`,
  value `180000`.
- `GRN-20260623-001165`: `Phuoc Hai`, `Than`, `60 kg`, value `1020000`.
- `GRN-20260623-001166`: `Bep Trung Tam`, `Tieu`, `500 g`, value `110000`.

The sale consumption cost basis still matches exactly. The changed cost-basis
rows in the report are moving-average valuation drift from current source
replay, especially after the later `Tieu` receipt at unit cost `220`; they are
not fixed master-data mismatches in the accepted target ledger.

## Smoke checks

- Production health: `https://app.comtammatu.com/api/health` returned
  `{"status":"ok","db":"ok"}`.
- Authenticated UI smoke opened:
  - `/inventory/stock`
  - `/inventory/consumption`
  - `/finance/food-cost`
- `/inventory/stock` displayed the expected target stock value:
  `83.309.635đ`.

The aggregate imported sale consumption cost (`211098981.49`) is asserted by the
reconciliation report and finance mirror query. The default UI filters do not
display that full imported aggregate as a single visible number.

## Next controlled step

Do not rerun the full import blindly. If the new `matu-platform` documents need
to be brought over, run a delta dry-run first for the documents above, review
stock value and moving-average impact, then apply only the approved delta.
