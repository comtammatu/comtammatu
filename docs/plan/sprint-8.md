# Sprint 8: CMS / CRM Foundation (Post-v1.0)

> **Module mapping:** Post-v1.0 foundation for CMS + CRM
> Depends on: M2 (POS/orders), M4 (payments/refunds), M6 (finance context for retention reporting)
> Sessions: 6 | Estimate: 5-7 ngày

---

## Goal

Tạo nền tảng quản trị nội dung và dữ liệu khách hàng đủ dùng cho vận hành thực tế: khách hàng được gắn vào đơn, điểm tích lũy có sổ giao dịch rõ ràng, voucher có vòng đời audit được, và CMS có thể quản lý nội dung marketing theo tenant/branch.

## Scope Boundaries

### In scope

- Customer profile registry
- Order-linked purchase history
- Loyalty points ledger and member tiers
- Voucher issue/redeem/expire flow
- CMS content blocks for banner, promo, branch info, FAQ, and SEO metadata
- Media library for images and assets
- Draft / preview / publish / archive workflow

### Out of scope

- Omnichannel inbox
- Lead scoring
- Email/SMS/Zalo automation campaigns
- Arbitrary page builder
- Multi-brand CMS
- External CRM integrations

## Schema Sketch

### customers

```sql
CREATE TABLE public.customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  date_of_birth DATE,
  notes TEXT,
  consent_marketing BOOLEAN NOT NULL DEFAULT false,
  total_spent NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_orders INT NOT NULL DEFAULT 0,
  loyalty_points INT NOT NULL DEFAULT 0,
  tier_id BIGINT,
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone, tenant_id)
);
```

### loyalty_transactions

```sql
CREATE TABLE public.loyalty_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  customer_id BIGINT NOT NULL REFERENCES public.customers(id),
  type TEXT NOT NULL CHECK (type IN ('earn','redeem','expire','adjust')),
  points INT NOT NULL,
  balance_after INT NOT NULL,
  reference_type TEXT,
  reference_id BIGINT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### cms_assets

```sql
CREATE TABLE public.cms_assets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### cms_contents

```sql
CREATE TABLE public.cms_contents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  scope TEXT NOT NULL CHECK (scope IN ('global','branch')),
  branch_id BIGINT REFERENCES public.branches(id),
  content_type TEXT NOT NULL CHECK (content_type IN ('banner','promo','faq','branch_profile','seo')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  body JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug, tenant_id)
);
```

## Sessions

### S1: Customer Registry

**Acceptance Criteria:**

- [ ] Can create/search customer by phone
- [ ] Customer record is tenant-scoped and deduplicated by `(phone, tenant_id)`
- [ ] POS can attach an existing customer to an order
- [ ] No direct client-side writes to loyalty balance

### S2: Purchase History + Loyalty Ledger

**Acceptance Criteria:**

- [ ] Order payment completion writes a loyalty transaction
- [ ] Customer detail page shows total spent, total orders, and point history
- [ ] Ledger is append-only; balance is derived, not hand-edited
- [ ] Refund or void path can reverse points safely

### S3: Member Tiers + Voucher Flow

**Acceptance Criteria:**

- [ ] Tier upgrade is based on clear thresholds
- [ ] Voucher issue/redeem/expire has audit trail
- [ ] Voucher cannot be redeemed outside valid period or usage cap
- [ ] Campaign staff cannot change historical redemptions

### S4: CMS Content Registry

**Acceptance Criteria:**

- [ ] Can create draft content for banner, promo, FAQ, branch info, SEO metadata
- [ ] Tenant and branch scope are enforced
- [ ] Publish/unpublish flow is deterministic
- [ ] Content list supports status and scope filters

### S5: Media Library + Preview

**Acceptance Criteria:**

- [ ] Assets can be uploaded and reused by content entries
- [ ] Preview mode shows draft content before publish
- [ ] Archived content is hidden from public surfaces
- [ ] Media references do not leak across tenants

### S6: Polish + QA

**Acceptance Criteria:**

- [ ] ACL and RLS verified for CRM/CMS surfaces
- [ ] Server Actions validate with Zod
- [ ] `/verify` + `/review` passes
- [ ] Smoke test on POS customer attach + CMS publish flow

## Technical Tickets

> Use these as implementation tickets or PR slices. Order matters: foundation first, then CRM, then CMS, then integration and QA.

### S8-T01: Align terms, ACL, and route surface

**Type:** foundation

**Work:**

- Add `cms` to module ACL and route resolution
- Keep `crm` route as the customer-facing admin workspace
- Add nav entries for CMS and CRM in the admin shell
- Update glossary-driven labels so UI copy does not drift

**Dependencies:** none

**Done when:**

- CRM and CMS routes exist in the shell
- ACL and nav use the same canonical module keys
- No hardcoded placeholder labels remain in the shell for these modules

### S8-T02: Customer core schema

**Type:** database

**Work:**

- Create `customers`
- Add unique tenant-scoped phone constraint
- Add indexes for phone lookup, last_order_at, and tier lookup
- Add RLS policies and explicit grants
- Regenerate `pnpm db:types` after migration is merged and applied

**Dependencies:** S8-T01

**Done when:**

- Customer row can be created, read, searched, and updated through Supabase
- Tenant isolation is enforced at the row level
- Duplicate phone numbers are blocked per tenant
- Generated database types include the new customer table

### S8-T03: Loyalty ledger and member tiers

**Type:** database + RPC

**Work:**

- Create `loyalty_tiers`
- Create `loyalty_transactions`
- Add RPC for append-only point posting
- Derive current balance from ledger, not from manual edits
- Add refund/void reversal path

**Dependencies:** S8-T02, M2/M4 event data

**Done when:**

- Points are posted atomically
- Ledger entries are immutable after creation
- Refund/void can reverse prior earned points safely

### S8-T04: Voucher lifecycle

**Type:** database + server action

**Work:**

- Create `vouchers`
- Create `redemptions`
- Add issue/redeem/expire flow
- Validate date range, usage cap, and per-customer redemption rules
- Prevent direct balance manipulation through the UI

**Dependencies:** S8-T03

**Done when:**

- Voucher issuance and redemption are auditable
- Expired or overused vouchers cannot be redeemed
- Redemption writes are atomic and tenant-scoped

### S8-T05: CRM admin workspace UI

**Type:** web app

**Work:**

- Replace CRM placeholder page with workspace shell
- Add customer list, search, detail view, and tier summary
- Add customer attach flow for POS-linked orders
- Add history panels for orders, points, and vouchers

**Dependencies:** S8-T02, S8-T03, S8-T04

**Done when:**

- Staff can search by phone and open a customer detail page
- CRM shows purchase history and loyalty state
- POS can attach an existing customer to a completed order

### S8-T06: POS customer attach integration

**Type:** integration

**Work:**

- Add customer search/attach entry point in POS
- Persist customer reference on order or payment completion flow
- Show selected customer in receipt/order detail UI
- Make the link resilient to stale customer state

**Dependencies:** S8-T02, S8-T05

**Done when:**

- Customer attachment works without page reload hacks
- Attached customer is visible in the POS flow and order history
- No direct client write touches loyalty state

### S8-T07: CMS content schema

**Type:** database

**Work:**

- Create `cms_assets`
- Create `cms_contents`
- Add content types for banner, promo, FAQ, branch profile, and SEO
- Add scope controls for global vs branch content
- Add version/status fields for draft/published/archived
- Regenerate `pnpm db:types` after migration is merged and applied

**Dependencies:** S8-T01

**Done when:**

- CMS entries are tenant-scoped
- Branch-scoped content can be queried without leaking across tenants
- Draft and published states are explicit in the schema
- Generated database types include the new CMS tables

### S8-T08: CMS publishing workflow

**Type:** web app + server action

**Work:**

- Add create/edit/preview/publish/archive actions
- Wire validation with Zod
- Support filtering by content type, status, and scope
- Ensure publish transitions are deterministic and auditable

**Dependencies:** S8-T07

**Done when:**

- Users can draft, preview, publish, and archive content
- Invalid status transitions are blocked
- No raw Supabase errors are surfaced to the client

### S8-T09: Media library

**Type:** storage + web app

**Work:**

- Define upload metadata and asset registry
- Add reusable asset picker for CMS entries
- Add alt text and MIME type tracking
- Keep tenant boundaries strict for asset visibility

**Dependencies:** S8-T07

**Done when:**

- Uploaded assets can be reused across CMS content entries
- Media assets are not visible across tenants
- Preview mode renders assets correctly

### S8-T10: Campaign/reporting hooks

**Type:** integration

**Work:**

- Add CRM summary fields for spend, frequency, and last visit
- Add lightweight cohort/segment queries for future campaigns
- Prepare hooks for revenue and loyalty reporting
- Keep the implementation read-only for first release

**Dependencies:** S8-T03, M6

**Done when:**

- CRM summary numbers are available for dashboards
- No automation is triggered yet
- Data can feed future campaign features without schema churn

### S8-T11: ACL, RLS, and test coverage

**Type:** security + QA

**Work:**

- Add/verify RLS for customer, loyalty, voucher, and CMS tables
- Add explicit grants for authenticated users
- Add server action validation tests
- Smoke test search, attach, publish, and redemption flows

**Dependencies:** S8-T02 through S8-T09

**Done when:**

- Tenant isolation holds for all new tables
- No direct client write path bypasses RPC or server action validation
- `/verify` and `/review` pass on the sprint branch
