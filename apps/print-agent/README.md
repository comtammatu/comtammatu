# @comtammatu/print-agent

Thermal print agent for Cơm Tấm Má Tư. Subscribes to Supabase Realtime for `print_jobs`,
rasterizes print documents to ESC/POS (bitmap mode), dispatches to LAN (TCP:9100)
thermal printers.

**1 agent per branch** serves all 3 printers at that branch (receipt / kitchen_1 / kitchen_2).

LAN-only. No native deps. Runs on Windows, Termux (Android), Raspberry Pi, any ARM/x64
Linux with Node 24.

## Architecture

```
Browser POS ─ Server Action ─▶ Postgres RPC ─▶ print_jobs row
                                                     │
                                           Realtime INSERT ─▶ Agent (this)
                                                     │
                                            claim → render → TCP:9100
                                                     │
                                            complete_print_job(success)
```

## Prerequisites

- Node.js 24.x
- Supabase service role key (agent runs as service principal, not a user)
- All branch printers must be network-connected with `printers.connection_type='lan'`
  and `lan_host` filled. Non-LAN printer rows fail dispatch with a clear error.

## Development

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TENANT_ID, AGENT_BRANCH_ID
# Set AGENT_ID and PRINT_AGENT_PRESENCE_TOKEN if WEB_BASE_URL is enabled.
pnpm install
pnpm dev
```

The agent also reads `.env.local` if present. When both `.env` and `.env.local`
exist, `.env.local` wins. For service installs, place deployed values in `.env`
and do not ship `.env.local`.

## Build

```bash
pnpm build          # esbuild → dist/index.js (single self-contained file)
```

`dist/index.js` bundles all dependencies (including `@comtammatu/print-render`
and the embedded Roboto Mono fonts) — branch machines need Node only, no
`node_modules` and no asset folders. There is no standalone binary build —
agent always runs through Node.

## Run

```bash
pnpm start                 # node dist/index.js
```

Or run as a long-lived service via your platform's process manager
(NSSM on Windows, systemd on Linux, termux-services on Android).

### Windows Service via NSSM

```powershell
# Run as Administrator
cd apps\print-agent
.\scripts\install-service.ps1
```

The script registers service `ComTamMaTu-PrintAgent` with auto-restart on crash,
launching `node.exe dist\index.js`. Logs rotate at 10 MB each:

```
C:\ProgramData\ComTamMaTu\print-agent\logs\agent.out.log
C:\ProgramData\ComTamMaTu\print-agent\logs\agent.err.log
```

Uninstall:

```powershell
.\scripts\uninstall-service.ps1
```

## Environment variables

| Key                          | Required                     | Description                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`               | yes                          | `https://<ref>.supabase.co`                                                                                                                                                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`  | yes                          | Service role JWT (bypasses RLS)                                                                                                                                                                                                                         |
| `AGENT_TENANT_ID`            | yes                          | Numeric tenant id                                                                                                                                                                                                                                       |
| `AGENT_BRANCH_ID`            | yes                          | Numeric branch id this agent serves                                                                                                                                                                                                                     |
| `AGENT_ID`                   | required with presence       | Stable identifier. Required when `PRINT_AGENT_PRESENCE_TOKEN` is set because presence tokens are bound to this value.                                                                                                                                   |
| `WEB_BASE_URL`               | no                           | Web app base URL for branch-presence registration.                                                                                                                                                                                                      |
| `PRINT_AGENT_PRESENCE_TOKEN` | required with `WEB_BASE_URL` | Raw per-agent bearer token for `/api/branch-presence`. Store only its SHA-256 hash in `printer_agent_presence_tokens`.                                                                                                                                  |
| `PRINT_TIMEOUT_MS`           | no                           | Per-attempt socket timeout. Default `5000`.                                                                                                                                                                                                            |
| `PRINT_MAX_ATTEMPTS`         | no                           | Total send attempts before a job is marked `failed`. Default `3`. A resend stops the moment any bytes reach the printer, so a half-sent ticket is never duplicated.                                                                                       |
| `PRINT_RETRY_BACKOFF_MS`     | no                           | Linear backoff base between attempts. Default `750` (750ms, 1500ms, …).                                                                                                                                                                                 |

Provision or rotate the token from the repo CLI:

```bash
pnpm --filter @comtammatu/print-agent presence:provision -- create \
  --tenant-id 1 \
  --branch-id 1 \
  --agent-id pos-branch-1 \
  --confirm-project-ref iexwsuaqqenyjiskawoj
```

The command generates a raw token, stores only its SHA-256 hash for the exact
`(tenant_id, branch_id, agent_id)` tuple, and prints the `.env` snippet once.
Use `rotate` to intentionally replace an existing token, `revoke` to disable it,
and `status` to inspect token/IP state:

```bash
pnpm --filter @comtammatu/print-agent presence:provision -- status \
  --tenant-id 1 --branch-id 1 --agent-id pos-branch-1
```

The old global shared-token mode is retired; one leaked branch token must not
register another branch.

## Rendering

Rendering lives in `@comtammatu/print-render` (shared with the admin template
editor preview, so paper and preview stay pixel-identical). The agent
rasterizes every line via pureimage + Roboto Mono (embedded in the bundle),
sending `GS v 0` raster image commands. This bypasses
firmware font tables entirely — the printer just prints pixels, so Vietnamese
renders correctly on any ESC/POS printer (PDIT PD805KL and clones included).
Native ESC/POS QR commands are still used for payment QR codes.

Ticket layouts are data-driven: each `print_jobs.payload` carries a
`document` block list materialized from `print_template_versions` by the
database. Change layouts there — not in per-branch agent deployments. When a
payload has no `document` (template apply fail-soft), the agent rebuilds an
equivalent block list locally from the typed payload.

Layout constraints (576-dot canvas, Roboto Mono @ 20px):

- Normal text: max 48 chars/line
- Double-size banners (BÀN, TỔNG CỘNG, etc.): **max 24 chars/line** —
  content that exceeds this gets clipped off the right edge.

Smoke-test against a real printer:

```bash
PRINTER_HOST=192.168.1.240 pnpm test:print                      # all 5 ticket kinds
PRINTER_HOST=192.168.1.241 TYPE=kitchen_ticket pnpm test:print  # one kind
```

Render-only check (no printer needed):

```bash
pnpm --filter @comtammatu/print-render test
```

## Runtime loops

- **Realtime INSERT** on `print_jobs` (filter: `branch_id=eq.<BRANCH>`)
- **Heartbeat** upsert to `printer_agents` every 30s (`is_online` threshold: 60s)
- **Printer cache refresh** every 5 min
- **Pending drain** every 15s (safety net for missed Realtime events)
- **Stuck-job janitor** every 60s (re-pending `processing` rows older than 5 min)

## Running on Termux (Android) / Raspberry Pi / other Linux

For branches whose POS is an Android tablet (no Windows PC). The bundle is
self-contained — build it once at the repo, then the device only needs Node:

```bash
# At the repo (any machine):
pnpm --filter @comtammatu/print-agent build
bash apps/print-agent/scripts/build-bundle.sh

# Termux (Android): install Node 24, copy + unzip the bundle, then:
pkg install nodejs-lts
cp .env.example .env
# ...fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TENANT_ID, AGENT_BRANCH_ID
node dist/index.js
# Keep alive under Termux:
#   pkg install termux-services && sv-enable print-agent
```

Same flow on Raspberry Pi / any ARM Linux.

## Troubleshooting

- **"printer N: only connection_type='lan' is supported"** — a non-LAN printer row
  was created. Update `printers.connection_type='lan'` and fill `lan_host`, or
  deactivate the row.
- **"printer N not in cache / inactive"** — flip `printers.is_active=true` then wait
  up to 5 min, or restart the service.
- **"printer host:port timed out"** — verify the printer is on the same LAN as the
  agent host and reachable on TCP:9100 (try `nc <host> 9100`).
- **Realtime status stuck on `CHANNEL_ERROR`** — check service key validity and
  that `print_jobs` is in the `supabase_realtime` publication.
