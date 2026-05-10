# Viettel S-invoice WebServices — HĐĐT Integration Guide

> Ap dung: Com Tam Ma Tu CTCP — Finance / HDDT dau ra
> Last updated: 2026-05-09
> Provider canonical: **Viettel S-invoice / Sinvoice**. MISA meInvoice chi la legacy/optional provider khi owner explicit chon.

## 1. Source status

Tai lieu public cua S-invoice dang khong on dinh nhu mot API portal hien dai:

- Trang `https://sinvoice.viettel.vn/tai-ve` hien redirect sang SME HUB landing page.
- Public WebService docs van co cac ban mirror/huong dan Postman, trong do co endpoint va payload mau.
- Truoc production, owner/tech lead phai yeu cau Viettel BU gui ban WebService PDF/Word moi nhat dung voi account, chu ky so va moi truong cua Com Tam Ma Tu.

Nguon public da doi chieu:

- Viettel SME/SInvoice landing: `https://sme.viettel.vn/landing-page?alias=SINVOICE`
- VInvoice API host: `https://api-vinvoice.viettel.vn`
- Public WebService mirror: `https://tlptech.vn/tai-lieu-mo-ta-webservice-hoa-don-dien-tu-viettel-api`
- Public Postman guide: `https://viettel-invoice.vn/ho-tro/35-su-dung-postman-goi-api-webservice-hoa-don-dien-tu/`

Quy uoc doc nay:

- Endpoint ben duoi ghi theo **relative action** cua Viettel (`/InvoiceAPI/...`).
- Trong code, production host hien la `https://api-vinvoice.viettel.vn` va prefix la `/services/einvoiceapplication/api`, nen full URL se la:

```text
https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/<Action>
```

Viettel docs cu cung co demo host:

```text
https://demo-sinvoice.viettel.vn:8443/InvoiceAPI
```

Khong tu y doi host trong production neu BU chua confirm. Code cho phep override bang `SINVOICE_BASE_URL`.

## 2. Provider policy

HDDT production cua du an la Viettel S-invoice:

```env
INVOICE_PROVIDER=viettel
```

Alias hop le:

```env
INVOICE_PROVIDER=sinvoice
```

MISA chi duoc dung khi owner chu dong rollback/doi provider:

```env
INVOICE_PROVIDER=misa
```

Runtime policy nam o:

- `packages/shared/src/providers/invoice-provider-policy.ts`
- `apps/web/lib/invoice-provider-init.ts`
- `packages/shared/src/providers/impl/viettel-sinvoice.ts`

## 3. Required onboarding from Viettel BU

Truoc cutover, can lay ro cac muc sau tu Viettel BU:

| Hang muc | Can confirm |
|---|---|
| Account API | Username/password production, MST nguoi ban, user co quyen webservice |
| IP whitelist | Dia chi IP public cua Vercel/egress neu BU bat whitelist |
| Auth mode | BasicAuth moi request, `/auth/login` + `Cookie: access_token=...`, `Authorization: Bearer ...`, hay chap nhan ca hai |
| Base URL | `https://api-vinvoice.viettel.vn` hay host rieng theo hop dong |
| Template/series | `SINVOICE_TEMPLATE_CODE`, `SINVOICE_INVOICE_SERIES` rieng cho B2B va B2C summary |
| Chu ky so | HSM/server cert/cloud CA cho API tu dong; USB token khong phu hop cron server-side |
| File endpoints | Endpoint lay XML/PDF chinh thuc va loai file can luu |
| Cancel/replace | Payload bat buoc cho xoa bo, dieu chinh, thay the theo TT78 |
| Timeout/rate limit | SLA, retry policy, duplicate `transactionUuid` semantics |

## 4. Environment variables

Production/preview config:

```env
INVOICE_PROVIDER=viettel
SINVOICE_USERNAME=<api_user_or_mst_suffix>
SINVOICE_PASSWORD=<api_password>
COMPANY_TAX_CODE=<supplier_tax_code>
SINVOICE_TEMPLATE_CODE=<template_code>
SINVOICE_INVOICE_SERIES=<invoice_series>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
# SINVOICE_SANDBOX=true
```

Notes:

- `COMPANY_TAX_CODE` la `supplierTaxCode` truyen vao path/body, khong mac dinh bang username neu username co suffix rieng.
- Public examples co nhieu test account va password khac nhau. Chi dung credential Viettel BU cap cho moi truong dang test.
- `SINVOICE_SANDBOX` hien chi la informational flag; code phan biet sandbox/prod bang credential va base URL.

## 5. Auth

Public docs dang ton tai 2 kieu xac thuc:

1. Postman guide cu: BasicAuth per request.
2. VInvoice 2.x docs: `POST /auth/login` lay `access_token`, sau do truyen token vao header `Cookie: access_token=...`.

Code hien tai:

```text
POST {SINVOICE_BASE_URL}/auth/login
Authorization: Basic base64(username:password)
Accept: application/json
```

Sau login, provider goi API voi:

```http
Authorization: Bearer <access_token>
Accept: application/json
Content-Type: application/json
```

Risk can confirm voi BU:

- Neu BU yeu cau `Cookie: access_token=...`, provider can them header Cookie hoac doi auth header.
- Neu BU yeu cau login JSON body (`{"username":"...","password":"..."}`), provider can doi `login()`.
- Neu BU chap nhan BasicAuth per request, co the bo token cache nhung khong nen gui password moi call neu token flow hoat dong.

Khuyen nghi sau sandbox: provider nen gui ca `Authorization: Bearer <token>` va `Cookie: access_token=<token>` neu Viettel chap nhan. Khong lam truoc khi test vi co the thay doi hanh vi auth.

## 6. WebServices map

### 6.1 Create invoice

Public docs:

```text
POST /InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}
Content-Type: application/json
```

Current implementation:

```text
POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/{COMPANY_TAX_CODE}
```

Payload groups:

- `generalInvoiceInfo`
- `buyerInfo`
- `sellerInfo`
- `payments`
- `itemInfo`
- `summarizeInfo`
- `taxBreakdowns`

Current code builds:

```json
{
  "generalInvoiceInfo": {
    "invoiceType": "01GTKT",
    "templateCode": "<SINVOICE_TEMPLATE_CODE>",
    "invoiceSeries": "<SINVOICE_INVOICE_SERIES>",
    "currencyCode": "VND",
    "transactionUuid": "HDDT0000000000000000000000000001",
    "adjustmentType": "1",
    "paymentStatus": true,
    "paymentType": 3,
    "paymentTypeName": "TM/CK",
    "cusGetInvoiceRight": true,
    "userName": "<SINVOICE_USERNAME>"
  }
}
```

Confirm voi BU:

- `paymentType` dang la number `3`, trong public samples thuong la string `"TM"`. Neu BU khong chap nhan `3`, doi provider sang string theo account/template.
- B2B realtime va B2C daily summary co the can template/series khac nhau. Hien env chi co 1 pair `templateCode` + `invoiceSeries`; neu BU yeu cau tach, can them config theo invoice kind.

### 6.2 Lookup/reconcile by transactionUuid

Public docs:

```text
POST /InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid
Content-Type: application/x-www-form-urlencoded
Cookie: access_token=...

supplierTaxCode=<tax_code>&transactionUuid=<transaction_uuid>
```

Use case:

- Doi soat khi request create timeout.
- Poll invoice da submit de lay `invoiceNo`, `reservationCode`, `codeOfTax`, `exchangeStatus`, `exchangeDes`.

Current implementation gap:

- `ViettelSinvoiceProvider.getStatus()` dang goi `/InvoiceAPI/InvoiceUtilsWS/getInvoiceById` voi JSON `{ supplierTaxCode, transactionUuid }`.
- Public docs minh tim thay uu tien `searchInvoiceByTransactionUuid`, khong thay du bang chung public cho `getInvoiceById`.
- Truoc khi bat reconcile cron, can confirm endpoint voi BU va cap nhat provider neu can.

### 6.3 PDF/XML files

Public docs co 2 nhom:

```text
POST /InvoiceAPI/InvoiceUtilsWS/getInvoiceFilePortal
Content-Type: application/x-www-form-urlencoded
```

Lay file co ma bi mat, output co `fileToBytes` base64/bytes va `fileName`.

```text
POST /InvoiceAPI/InvoiceWS/createExchangeInvoiceFile
Content-Type: application/x-www-form-urlencoded
```

Lay PDF ban chuyen doi. Public docs luu y nen doi 2-5 giay sau khi phat hanh vi he thong xu ly bat dong bo.

Current implementation gap:

- Chua co `getInvoiceFile()` trong `InvoiceProvider`.
- Pilot chap nhan link/portal Viettel; post-pilot can them PDF/XML persist vao Storage neu can giao file truc tiep cho khach/audit.

### 6.4 Cancel invoice

Public docs:

```text
POST /InvoiceAPI/InvoiceWS/cancelTransactionInvoice
Content-Type: application/x-www-form-urlencoded
```

Form fields public docs neu:

- `supplierTaxCode`
- `templateCode` optional
- `invoiceNo`
- `strIssueDate`
- `additionalReferenceDesc`
- `additionalReferenceDate`
- `reasonDelete` optional

Current implementation gap:

- `InvoiceProvider.cancelInvoice(providerRef, reason)` chi nhan `providerRef` va `reason`.
- `ViettelSinvoiceProvider.cancelInvoice()` dang goi `/InvoiceAPI/InvoiceWS/cancelTransactionInvoice/{taxCode}` voi JSON `{ supplierTaxCode, transactionUuid, additionalReferenceDesc }`.
- Public docs minh tim thay khong khop voi payload nay. Khong nen coi native cancel la production-ready cho den khi BU confirm.

Follow-up ky thuat:

- Persist `invoiceNo`, `issueDate`, `reservationCode`, `codeOfTax` trong `provider_data`.
- Mo rong cancel flow de lay du field bat buoc truoc khi goi Viettel.
- Neu BU co cancel-by-transactionUuid endpoint, ghi endpoint do vao doc nay va test integration.

### 6.5 Replace/adjust invoice

Public docs dung chung create endpoint voi cac truong adjustment:

- `adjustmentType`
- `adjustmentInvoiceType`
- `originalInvoiceId`
- `originalInvoiceIssueDate`
- `additionalReferenceDesc`
- `additionalReferenceDate`
- `originalInvoiceType`
- `originalTemplateCode`

Current policy:

- Pilot refund-after-batch va late B2B after batch xu ly manual qua Viettel S-invoice portal.
- Native replace/adjust la post-pilot, khong nen lam nua voi MISA assumptions.

## 7. Payload mapping for Com Tam Ma Tu

### B2B realtime

| App data | S-invoice field |
|---|---|
| `tax_invoices.id` | `transactionUuid` via `buildSinvoiceTransactionUuid(id)` |
| Tenant legal name | `sellerInfo.sellerLegalName` |
| `COMPANY_TAX_CODE` | path `{supplierTaxCode}` + `sellerInfo.sellerTaxCode` |
| Customer name | `buyerInfo.buyerName`, `buyerInfo.buyerLegalName` |
| Customer tax code | `buyerInfo.buyerTaxCode` |
| Customer address | `buyerInfo.buyerAddressLine` |
| Order lines | `itemInfo[]` |
| Per-line VAT | `itemInfo.taxPercentage`, `itemInfo.taxAmount` |
| Net total | `summarizeInfo.totalAmountWithoutTax` |
| VAT total | `summarizeInfo.totalTaxAmount` |
| Gross total | `summarizeInfo.totalAmountWithTax` |

### B2C daily summary

| App data | S-invoice field |
|---|---|
| Branch + summary date | Internal only; must stay in `tax_invoice_orders` audit |
| Buyer name | `Khach hang khong lay hoa don` or BU-approved Vietnamese phrase |
| Buyer tax code | Empty |
| Lines | Group by VAT rate, e.g. "Do an 8%", "Do uong co con 10%" |
| VAT breakdown | One row per tax rate if BU/template supports multi-rate |

Important:

- `line_items_for_misa` la legacy field name trong RPC result, nhung payload la provider-neutral.
- F&B mixed VAT la case binh thuong. Khong duoc suy `vat_amount` tu mot invoice-level `vat_rate` neu line co nhieu rate.

## 8. Rounding and validation rules

S-invoice validate rat chat. Provider phai gui NET amount theo line:

| Rule | Need satisfy |
|---|---|
| Line net | `quantity * unitPrice ~= itemTotalAmountWithoutTax` |
| Line tax | `(itemTotalAmountWithoutTax - itemDiscount) * taxPercentage / 100 ~= taxAmount` |
| Tax total | `totalTaxAmount ~= sum(itemInfo.taxAmount)` |
| Net total | `sumOfTotalLineAmountWithoutTax ~= sum(itemInfo.itemTotalAmountWithoutTax)` |
| UUID length | `transactionUuid` 10-36 chars |

Project rule:

- Recompute S-invoice totals from line payload before send.
- Allow only tiny VND rounding tolerance.
- Surface provider rejection as failed/submitted retry path; do not silently mutate legal totals after DB commit.

## 9. Idempotency and retry

`transactionUuid` is the integration key. Public docs say it is used to avoid duplicate invoice creation and can be used for reconciliation after timeout.

Project implementation:

```text
buildSinvoiceTransactionUuid(tax_invoice.id) -> 32-char "HDDT..."
```

Rules:

- Persist `provider_ref = transactionUuid`.
- Retry with the same `transactionUuid`, never generate random UUID for the same DB invoice.
- If create times out, first lookup by transactionUuid before creating another invoice.
- If Viettel returns "transaction is being processed", back off and reconcile.

## 10. State mapping

Current app state:

| Provider result | App state |
|---|---|
| No invoice number yet | `signing` |
| `invoiceNo` returned but CQT code not confirmed | `submitted` |
| CQT code/reservation/codeOfTax confirmed | `issued` |
| Provider cancellation confirmed | `cancelled` |
| Replacement confirmed | `replaced` |

Important gap:

- Current create implementation treats `invoiceNo` as `submitted`, not final `issued`.
- Reconcile cron is required before we can promise automated `issued` for all invoices.

## 11. Smoke test checklist

Run only on approved dev/test S-invoice account.

1. Confirm IP whitelist with Viettel BU.
2. Set preview env:

```env
INVOICE_PROVIDER=viettel
SINVOICE_USERNAME=<test_user>
SINVOICE_PASSWORD=<test_password>
COMPANY_TAX_CODE=<test_supplier_tax_code>
SINVOICE_TEMPLATE_CODE=<test_template>
SINVOICE_INVOICE_SERIES=<test_series>
SINVOICE_BASE_URL=<BU_confirmed_base_url>
```

3. Trigger one B2B test invoice.
4. Trigger one B2C daily summary test invoice.
5. Verify DB:

```sql
SELECT id, invoice_kind, status, provider, provider_ref, invoice_number, provider_data
FROM tax_invoices
ORDER BY created_at DESC
LIMIT 10;
```

Expected:

- `provider = 'viettel'`
- `provider_ref` is 32-char `HDDT...`
- `status in ('submitted','issued')`
- `provider_data` has `transactionUuid`, and when available `reservationCode` / `codeOfTax`.

6. Use Viettel portal/API to lookup same `transactionUuid`.
7. If PDF/XML is required, test `getInvoiceFilePortal` or `createExchangeInvoiceFile` manually before adding UI.

## 12. Known gaps before production-grade HĐĐT

| Priority | Gap | Action |
|---|---|---|
| P0 | BU contract not pinned in repo | Add latest BU-provided WebService PDF/notes to private ops storage; record version/date here |
| P0 | Auth header ambiguity | Sandbox test login + create with current code; if fail, update provider to Cookie token or JSON login |
| P0 | Reconcile endpoint mismatch | Confirm `searchInvoiceByTransactionUuid` vs `getInvoiceById`; update `getStatus()` |
| P0 | Native cancel mismatch | Confirm cancel-by-transactionUuid or refactor cancel to use invoiceNo/issueDate |
| P1 | PDF/XML not implemented | Add provider file method + Storage retention policy |
| P1 | Template split | Add per-kind template config if B2B/B2C use different template/series |
| P1 | Timeout policy | Public docs recommend long timeout; align with deployment limits and provider SLA |
| P1 | Replace/adjust automated flow | Implement only after pilot accounting workflow is stable |

## 13. Do not regress

- Do not rename Viettel S-invoice work back to MISA.
- Do not add provider HTTP calls inside Postgres RPCs.
- Do not send invoice-level VAT if line-level VAT differs.
- Do not issue a second invoice for the same `tax_invoice.id` with a new `transactionUuid`.
- Do not return raw Viettel error messages directly to clients; map to safe app messages and keep raw data in audit/provider_data.
