# ADR 0046 — SUNMI Virtual ESC/POS WiFi/LAN Printer Bridge for Food Delivery Platforms

**Status:** Accepted

**Decision owner:** Owner, 2026-08-25 (confirmed Shopee Partner running on SUNMI V3 with LAN/WiFi printer support)

**Review tier:** T2 — architecture, integration, webhook security, edge device deployment

**Amends:** Extends ADR 0025; operationalizes food delivery intake for ShopeeFood on SUNMI POS hardware.

**Keeps:** D103 (Delivery platform intake isolation) and D104 (Delivery platform webhook boundary); `create_order` RPC atomic intake contract; KDS kitchen routing; e-invoice MTT issuance.

## Context

Food delivery platforms in Vietnam (ShopeeFood / Now, GrabFood, beFood, Green SM Food) have divergent integration capabilities:
1. **ShopeeFood** does not provide an open public API for independent POS systems (whitelisted for select POS vendors via QR onboarding).
2. The Shopee Partner web portal (`partner.shopee.vn/order/report-restaurant`) is a historical report view, not an active real-time order intake surface.
3. At store branches (e.g. branch 1 / Nguyen Huu Tho), the **Shopee Partner application runs directly on the SUNMI POS V3** terminal.
4. Android OS does not permit Bluetooth SPP loopback (a single device cannot pair with itself over Bluetooth SPP).
5. However, Shopee Partner natively supports **LAN / WiFi ESC/POS Network Thermal Printers**. TCP network sockets (`127.0.0.1:9100` or device LAN IP:9100) have no loopback restrictions on Android.

## Relationship to Governance Decisions (D103 & D104)

- **D103** isolates delivery platform intake to dedicated webhook routes (`/api/webhooks/<platform>/relay`) rather than monolithic POS table orders.
- **D104** enforces strict perimeter security on webhook endpoints (signature verification, schema validation, rate/payload limits, atomic RPC ingestion).
- **ADR 0046 aligns fully with D103 and D104**:
  - The SUNMI Virtual WiFi Printer Bridge serves as a hardware-ingress edge daemon (similar to `apps/print-agent`).
  - It does not bypass the webhook perimeter: it dispatches authenticated HTTP payloads with `SHOPEE_RELAY_SECRET` to the isolated `/api/webhooks/shopeefood/relay` endpoint.
  - The webhook invokes the canonical `create_order` RPC with `p_order_type: 'delivery'` and leaves orders in `payment_status: 'unpaid'` for driver tender reconciliation.

## Decision

1. **Virtual ESC/POS Network Printer Architecture**:
   - Deploy a lightweight Android background service (`VirtualWifiPrinterService`) on the SUNMI POS V3.
   - The service opens a TCP `ServerSocket` on raw printer port **9100** (standard JetDirect / ESC/POS protocol).
   - In the Shopee Partner app (Settings $\rightarrow$ WiFi / LAN Printer), point the printer destination to `127.0.0.1:9100` (or the terminal's LAN IP).
2. **Dual-Relay Processing**:
   - When Shopee Partner triggers an automatic receipt print upon order arrival / acceptance:
     1. The TCP listener captures the full binary ESC/POS stream.
     2. An ESC/POS Parser tokenizes and extracts structured order data (`orderId`, `displayId`, items, toppings/sides, notes, cutlery requirement, totals).
     3. The service dispatches an authenticated HTTP POST webhook to `/api/webhooks/shopeefood/relay` with `x-shopee-relay-secret`.
     4. The service passes the raw ESC/POS bytes directly to the built-in SUNMI thermal print head via the official **SUNMI Printer SDK** AIDL interface (`SunmiPrinterService.sendRAWData`).
3. **Platform Scope & Deduplication**:
   - Implement **ShopeeFood first**. GrabFood remains on its stable browser extension.
   - Strictly prohibit dual-run of extension + printer bridge for the same platform on the same branch to prevent duplicate intake.
   - Deterministic idempotency: `idempotencyKey = sha256("shopeefood-" + orderId)`. Receipts lacking a parseable order code are rejected with HTTP 400 rather than assigned randomized IDs.
4. **Offline Resilience & Security**:
   - Local SQLite queue (`OrderQueueDbHelper`) on the SUNMI terminal buffers webhook dispatches during network blips with exponential backoff retry.
   - Webhook endpoint validates payload size ($\le 64\text{ KB}$) and enforces `SHOPEE_RELAY_SECRET` in production.

## Consequences

- **Zero Manual Re-keying**: Orders from ShopeeFood instantly appear on KDS Kitchen Screens and trigger LAN kitchen preparation tickets without cashier manual data entry.
- **Reliable Paper Printout**: The driver/bag receipt prints automatically from the SUNMI V3 built-in printer head.
- **Hardware Efficiency**: Operates entirely within the single SUNMI POS V3 terminal already present at the cashier station.
- **E-Invoice Compliance**: Gross sales prices flow into the MTT queue under contract `SHOPEEFOOD_VN_0392303`.

## Verification

- Automated unit tests for ESC/POS stream parsing (`apps/web/tests/shopeefood-escpos-parser.test.ts`).
- End-to-end webhook relay integration tests (`apps/web/tests/shopeefood-relay-order.test.ts`).
- Physical verification on SUNMI POS V3 with Shopee Partner LAN printer output.
- `corepack pnpm verify` clean gate.
