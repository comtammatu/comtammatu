# Module Card — Print Agent & Branch Network

## Current State

The print agent is a separate Node package at `apps/print-agent`. It bridges
cloud print jobs to LAN (TCP:9100) thermal printers. LAN-only — no USB
transport, no native bindings. Runs on Windows, Termux (Android), Raspberry Pi,
or any ARM/x64 Linux with Node 24.

## Core Files

- `apps/print-agent/src/index.ts`
- `apps/print-agent/src/lan.ts`
- `apps/print-agent/src/escpos.ts`
- `apps/print-agent/src/render-bitmap.ts`
- `apps/print-agent/src/print-document.ts`
- `apps/web/app/api/branch-presence/route.ts`
- `apps/web/proxy.ts`
- `docs/runbooks/pos-kds/print-agent-pilot.md`

## Network Gate

`/api/branch-presence` is a bearer-token endpoint and bypasses session auth in proxy. It records branch trusted egress IPs used by POS/KDS production network gate.

POS/KDS production gate:

- Applies only when `NODE_ENV=production` and `POS_NETWORK_GATE !== "off"`.
- Checks client IP against recent trusted branch egress IP.
- Is defense-in-depth only. JWT/RLS remain the real data-access gate.

## Known Risks

From current task tracking:

- Presence token is global, not per-agent.
- Branch presence lacks real rate limiting.
- `settings:branch_network` permission key still needs enforcement in some actions.
- RLS still has legacy `auth_role()` paths.
- Soft revoke can be undone by a later heartbeat.

## What To Do Next

For print/network work:

1. All branch printers must have `printers.connection_type='lan'` and `lan_host` set — DB constraint enforces.
2. Treat network gate as an operational safety layer, not authorization.
3. Verify POS/KDS dev bypass and production behavior separately.
