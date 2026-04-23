# @comtammatu/print-agent

Thermal print agent for Cơm Tấm Má Tư. Subscribes to Supabase Realtime for `print_jobs`,
renders ESC/POS, dispatches to LAN (TCP:9100) or USB thermal printers.

**1 agent per branch** serves all 3 printers at that branch (receipt / kitchen_1 / kitchen_2).

## Architecture

```
Browser POS ─ Server Action ─▶ Postgres RPC ─▶ print_jobs row
                                                     │
                                           Realtime INSERT ─▶ Agent (this)
                                                     │
                                         claim → render → TCP:9100 / USB
                                                     │
                                            complete_print_job(success)
```

## Prerequisites

- Node.js 24 (for `pnpm dev`) OR the packaged `.exe` (no Node needed)
- Windows 10 / 11 or Windows Server 2019+
- For Windows Service install: [NSSM](https://nssm.cc/) on `PATH` (`choco install nssm`)
- Supabase service role key (agent runs as service principal, not a user)
- For USB printers on Windows: the printer driver must NOT be installed as a standard
  Windows printer (Zadig → replace driver with WinUSB if needed)

## Development

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TENANT_ID, AGENT_BRANCH_ID
pnpm install
pnpm dev
```

## Build binary

```bash
pnpm build          # tsc → dist/
pnpm package        # @yao-pkg/pkg → dist-bin/comtammatu-print-agent.exe
```

Binary target: `node24-win-x64`. Native `usb` bindings are included via `pkg.assets`.

## Install as Windows Service

```powershell
# Run as Administrator
cd apps\print-agent
.\scripts\install-service.ps1
```

The script reads `.env` next to the exe and registers a service `ComTamMaTu-PrintAgent`
with auto-restart on crash. Logs rotate at 10 MB each:

```
C:\ProgramData\ComTamMaTu\print-agent\logs\agent.out.log
C:\ProgramData\ComTamMaTu\print-agent\logs\agent.err.log
```

Uninstall:

```powershell
.\scripts\uninstall-service.ps1
```

## Environment variables

| Key | Required | Description |
|-----|----------|-------------|
| `SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role JWT (bypasses RLS) |
| `AGENT_TENANT_ID` | yes | Numeric tenant id |
| `AGENT_BRANCH_ID` | yes | Numeric branch id this agent serves |
| `AGENT_ID` | no | Stable identifier (default: `agent-<pid>`) |
| `AGENT_VERSION` | no | Reported in heartbeat row |

## Runtime loops

- **Realtime INSERT** on `print_jobs` (filter: `branch_id=eq.<BRANCH>`)
- **Heartbeat** upsert to `printer_agents` every 30s (`is_online` threshold: 60s)
- **Printer cache refresh** every 5 min
- **Pending drain** every 60s (safety net for missed Realtime events)

## Troubleshooting

- **"USB printer not found"** — verify vendor/product ID with `usb.getDeviceList()` or
  `lsusb`; on Windows ensure WinUSB driver is bound.
- **"printer <id> not in cache / inactive"** — flip `printers.is_active=true` then wait
  up to 5 min, or restart the service.
- **Realtime status stuck on `CHANNEL_ERROR`** — check service key validity and
  `print_jobs` is in `supabase_realtime` publication.
