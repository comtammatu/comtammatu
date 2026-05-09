# Security Policy

> **Vietnamese:** Chính sách bảo mật cho dự án Cơm Tấm Má Tư. Báo cáo lỗ hổng qua email **comtammatu@gmail.com**. Phản hồi trong 5 ngày làm việc. Vui lòng KHÔNG mở GitHub issue công khai cho lỗ hổng bảo mật.
>
> **English:** Security policy for the Cơm Tấm Má Tư project. Report vulnerabilities to **comtammatu@gmail.com**. We respond within 5 business days. Please do **not** open a public GitHub issue for security vulnerabilities.

This document is the human-readable companion to the machine-readable RFC 9116 disclosure file: [`apps/web/public/.well-known/security.txt`](../apps/web/public/.well-known/security.txt) (served at `https://app.comtammatu.com/.well-known/security.txt`).

## Reporting a Vulnerability

**Email:** `comtammatu@gmail.com`

**Languages:** Tiếng Việt, English

**What to include:**

1. A clear description of the vulnerability (what, where, impact).
2. Steps to reproduce — proof-of-concept code, request samples, or screenshots.
3. The commit SHA or release tag you tested against (e.g. `1.2.0.3`).
4. Your contact information (so we can credit you if you opt-in).

**What to expect:**

| Stage | SLO |
|------|-----|
| Initial acknowledgement | 5 business days |
| Triage + severity assessment | 10 business days |
| Fix or mitigation deployed | depends on severity (see below) |

| Severity | Target time-to-fix |
|----------|--------------------|
| Critical (RCE, auth bypass, data exfiltration) | 7 days |
| High (privilege escalation, account takeover) | 14 days |
| Medium (XSS in low-privilege context, stored CSRF) | 30 days |
| Low (information disclosure, minor misconfig) | 90 days |

We support coordinated disclosure. Please give us a reasonable window before publishing details.

## Supported Versions

The Cơm Tấm Má Tư app is a single-tenant deployment. Only the production line (currently `1.2.x`) receives security fixes. The most recent tagged release is the active line.

| Version | Supported | Notes |
|---------|-----------|-------|
| 1.2.x | yes | Current production line. Patches land on `main` and ship as `1.2.0.N+1`. |
| 1.1.x | no | Superseded by 1.2.0.0 (QR feedback module headline release). |
| < 1.1 | no | Legacy. Out of support. |

If you find an issue in an unsupported version that also affects the supported line, we treat it as a 1.2.x bug.

## Scope

**In scope:**

- The production web app at `https://app.comtammatu.com` (Next.js 16.2 / Vercel).
- Source code in this GitHub repository (`comtammatu/comtammatu`), including `apps/web`, `packages/*`, and the database schema under `packages/database/migrations`.
- The Supabase project backing production (RLS policies, RPC functions, auth hooks).
- The QR feedback flow (`/r/[token]`), POS, KDS, and admin surfaces.

**Out of scope:**

- Third-party services we depend on but do not operate (Vercel platform, Supabase platform, GitHub itself, email providers). Report those to the respective vendors.
- Findings that require a compromised user device, physical access, or social engineering of staff.
- Denial-of-service via brute volumetric load (we rely on Vercel and Supabase platform protection).
- Issues in unsupported versions (see Supported Versions above).
- Self-XSS or attacks that require the victim to paste attacker-supplied JavaScript into their own console.
- Missing best-practice headers that have no demonstrated security impact (we already enforce CSP + 5 hardening headers in `apps/web/next.config.ts`).

## Safe Harbor

We will not pursue legal action against good-faith security researchers who:

- Report vulnerabilities privately via the email above before public disclosure.
- Do not exfiltrate customer data beyond the minimum needed to demonstrate impact.
- Do not degrade service for legitimate users (no DoS, no spam, no unsolicited messages to staff).
- Do not pivot to systems out of scope.

## Hall of Fame

We do not currently run a paid bug bounty (single-tenant CTCP, no security budget). We can offer:

- Public credit in the release notes (`docs/releases/X.Y.Z.md`) and the relevant CHANGELOG entry.
- A private acknowledgement if you prefer to stay anonymous.

## Existing Security Posture (for reporters)

So you don't waste time re-reporting things we already ship:

- **CSP + headers:** `apps/web/next.config.ts` enforces Content-Security-Policy, Strict-Transport-Security (with `preload`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. See `tasks/regressions.md` rule `SECURITY-HEADERS-IN-NEXT-CONFIG`.
- **Feedback flow:** Origin check, honeypot, server-side validation (Zod 4), TOCTOU-safe photo update with `.or("photo_paths.is.null,photo_paths.eq.{}")`. See `apps/web/app/r/[token]/actions.ts`.
- **Auth:** Supabase Auth with JWT custom claims (`tenant_id`, `branch_id`, `user_role`); auth hook is `SECURITY DEFINER`; RLS on every tenant-scoped table.
- **Server Actions:** All inputs validated with Zod 4 (per `CLAUDE.md` constraints).
- **Robots + security.txt:** `/robots.txt` disallows scraping `/r/`, `/admin/`. `/.well-known/security.txt` is RFC 9116-compliant with `Expires: 2027-05-09`.

## Document History

- `2026-05-09` — Initial publication (release `1.2.0.4`).

If anything in this document is unclear or out of date, email us — we'd rather hear from you than have you give up.
