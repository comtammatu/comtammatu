# Runner KDS Status Logic - 2026-06-09

PM: Scope is the Runner queue logic only. Done means paid/completed POS orders remain visible on Runner while their KDS tickets are still pending, preparing, or ready.

BA: Runner visibility is derived from `kds_tickets.status`; `orders.status` is commercial/POS lifecycle and may be `completed` after payment. Cancelled KDS tickets remain hidden because they are not Runner-visible work.

Senior Dev: Patch `packages/shared/src/runner/queue.ts` so `buildRunnerQueue` only requires a matching order row for display metadata and never gates by `order.status`. Keep route UI and query shape otherwise stable.

QA/QC: Add shared queue regression coverage for completed POS orders with live KDS tickets, then run the Runner queue tests and repo gates.
