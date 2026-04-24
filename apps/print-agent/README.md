# @comtammatu/print-agent

Thermal print agent for Cơm Tấm Má Tư. Subscribes to Supabase Realtime for `print_jobs`,
renders ESC/POS, dispatches to LAN (TCP:9100) or USB thermal printers.

**1 agent per branch** serves all 3 printers at that branch (receipt / kitchen_1 / kitchen_2).

Two transport modes, selected via `AGENT_TRANSPORT`:

- `all` (default) — LAN + USB. Requires `usb` native binding; Windows-only practical target.
- `lan` — LAN (TCP:9100) only. No native deps. Runs on Termux (Android), Raspberry Pi, any ARM/x64 Linux with Node 24.

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
| `AGENT_TRANSPORT` | no | `all` (default) or `lan`. `lan` skips USB dispatch entirely — safe on hosts without the `usb` native binding. |
| `PRINT_CODEPAGE_ID` | no | ESC/POS register index for CP1258. Default `38` (Epson). Xprinter often `30`; PDIT PD805KL needs calibration — see below. |
| `PRINT_ASCII` | no | `1` to strip Vietnamese diacritics (fallback when no CP1258 id works on the printer). Default off — Vietnamese is rendered via CP1258. |

## Vietnamese encoding calibration

Thermal printers decode high-byte characters via an ESC/POS code-page register,
whose numeric id for CP1258 (Vietnamese) **varies by firmware**. The default
(`38`, Epson) works on TM-series; clones (Xprinter, PDIT PD805KL) use other ids.

If Vietnamese renders as garbled glyphs (`Co?m su?o?|n`, `Co'm`, `Tại chỗ` →
`T?i ch?`), run the calibration sheet:

```bash
PRINTER_HOST=192.168.1.50 pnpm test:codepage
```

The printer emits one block per candidate (`15`, `28`, `30`, `38`, `52`). Read
the paper, find the block whose Vietnamese looks correct, then persist:

```bash
echo "PRINT_CODEPAGE_ID=30" >> .env   # example for Xprinter XP-T80A
```

Restart the agent. If **no** codepage renders correctly, fall back to ASCII:

```bash
echo "PRINT_ASCII=1" >> .env          # strips diacritics, readable but ugly
```

## Runtime loops

- **Realtime INSERT** on `print_jobs` (filter: `branch_id=eq.<BRANCH>`)
- **Heartbeat** upsert to `printer_agents` every 30s (`is_online` threshold: 60s)
- **Printer cache refresh** every 5 min
- **Pending drain** every 60s (safety net for missed Realtime events)

## Running LAN-only on Termux (Android) / Raspberry Pi / other Linux

For branches whose POS is an Android tablet (no Windows PC) and whose printers
are all network-connected (Xprinter / Epson TM with Ethernet or Wi-Fi):

```bash
# Termux (Android): install Node 24
pkg install nodejs-lts git

# Clone (or copy just apps/print-agent) and install without the native USB binding:
git clone <repo> && cd <repo>/apps/print-agent
pnpm install --no-optional   # or: npm install --omit=optional

# Configure
cp .env.example .env
# ...fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TENANT_ID, AGENT_BRANCH_ID
echo "AGENT_TRANSPORT=lan" >> .env

# Run
pnpm start
# Or keep alive under Termux:
#   pkg install termux-services && sv-enable print-agent
```

Same flow on Raspberry Pi / any ARM Linux — `--no-optional` (or `optionalDependencies`
failing silently on platforms without a `usb` prebuild) is how we avoid the native
compile step.

All printers for this branch must have `printers.connection_type='lan'`. If a USB
printer row is active on a LAN-only branch, its jobs will remain `pending` —
the agent logs a WARN at startup.

## Troubleshooting

- **"USB printer not found"** — verify vendor/product ID with `usb.getDeviceList()` or
  `lsusb`; on Windows ensure WinUSB driver is bound.
- **"printer <id> not in cache / inactive"** — flip `printers.is_active=true` then wait
  up to 5 min, or restart the service.
- **Realtime status stuck on `CHANNEL_ERROR`** — check service key validity and
  `print_jobs` is in `supabase_realtime` publication.
- **USB jobs stuck `pending` on LAN-only agent** — by design. A LAN-only agent
  (`AGENT_TRANSPORT=lan`) will not claim jobs whose printer has
  `connection_type='usb'`. Either flip the printer to LAN, or run a full agent
  alongside (Phase 2 / currently unsupported — hybrid deployment not yet hardened).
