# @comtammatu/print-agent

Thermal print agent for Cơm Tấm Má Tư. Subscribes to Supabase Realtime for `print_jobs`,
renders ESC/POS, dispatches to LAN (TCP:9100) or OS-bound Bluetooth serial thermal printers.

**1 agent per branch** serves all 3 printers at that branch (receipt / kitchen_1 / kitchen_2).

LAN + Bluetooth. No native deps. Runs on Windows, Termux (Android), Raspberry Pi, any ARM/x64
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

- Node.js 24+
- Supabase service role key (agent runs as service principal, not a user)
- Branch printers use `printers.connection_type='lan'` with `lan_host` as IP/hostname,
  or `connection_type='bluetooth'` with `lan_host` as the paired serial endpoint
  (`COM5`, `/dev/rfcomm0`, `/dev/tty.*`).

## Development

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TENANT_ID, AGENT_BRANCH_ID
pnpm install
pnpm dev
```

## Build

```bash
pnpm build          # tsc → dist/
```

`dist/index.js` is the entry point launched via `node dist/index.js`. There is no
standalone binary build — agent always runs through Node.

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

| Key | Required | Description |
|-----|----------|-------------|
| `SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role JWT (bypasses RLS) |
| `AGENT_TENANT_ID` | yes | Numeric tenant id |
| `AGENT_BRANCH_ID` | yes | Numeric branch id this agent serves |
| `AGENT_ID` | no | Stable identifier (default: `agent-<pid>`) |
| `AGENT_VERSION` | no | Reported in heartbeat row |
| `PRINT_MODE` | no | `text` (default) emits ESC/POS text commands using the printer's CP1258 firmware font. `bitmap` rasterizes Vietnamese via Roboto Mono TTF and emits raster image commands — use this on PDIT PD805KL / clones whose firmware has no usable CP1258 font. |
| `PRINT_CODEPAGE_ID` | no | Text-mode only. ESC/POS register index for CP1258. Default `38` (Epson). Xprinter often `30`. |
| `PRINT_ASCII` | no | Text-mode only. `1` to strip Vietnamese diacritics if no codepage works. |
| `PRINT_BT_TARGETS` | no | JSON endpoint overrides for Bluetooth printers by printer id or role, e.g. `{"12":"COM5","kitchen_1":"/dev/rfcomm0"}`. Overrides `printers.lan_host`. |
| `PRINT_BT_TARGET_<id>` | no | Per-printer Bluetooth endpoint override, e.g. `PRINT_BT_TARGET_12=COM5`. |
| `PRINT_BT_TARGET_<ROLE>` | no | Per-role Bluetooth endpoint override: `PRINT_BT_TARGET_RECEIPT`, `PRINT_BT_TARGET_KITCHEN_1`, `PRINT_BT_TARGET_KITCHEN_2`. |
| `WEB_BASE_URL` | no | Web app base URL for branch-presence registration. |
| `PRINT_AGENT_PRESENCE_TOKEN` | no | Shared bearer token for `/api/branch-presence`. |

## Bitmap mode (recommended for PDIT PD805KL)

If the printer firmware has no usable CP1258 font (PDIT PD805KL reports a
"Vietnam" code page at id 27, but ships with empty glyphs — verified via
self-test), set `PRINT_MODE=bitmap`:

```bash
echo "PRINT_MODE=bitmap" >> .env
```

The agent then rasterizes every line via pureimage + Roboto Mono (TTF
bundled in `assets/fonts/`), sending `GS v 0` raster image commands
instead of text bytes. This bypasses firmware font tables entirely — the
printer just prints pixels. Native ESC/POS QR commands still work.

Layout constraints in bitmap mode (576-dot canvas, Roboto Mono @ 20px):
- Normal text: max 48 chars/line
- Double-size banners (BÀN, TỔNG CỘNG, etc.): **max 24 chars/line** —
  content that exceeds this gets clipped off the right edge.

Smoke-test before enabling in production:

```bash
PRINTER_HOST=192.168.1.240 TYPE=all pnpm test:all   # receipts + bill
PRINTER_HOST=192.168.1.241 TYPE=kitchen pnpm test:all
```

## Vietnamese encoding calibration (text mode only)

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

Restart the agent. If **no** codepage renders correctly, switch to bitmap mode
above (preferred), or strip diacritics:

```bash
echo "PRINT_ASCII=1" >> .env          # readable but ugly
```

## Bluetooth mode

Bluetooth support intentionally avoids native Node bindings. Pair the printer in
the host OS first, bind it as a serial endpoint, then set the printer row to
`connection_type='bluetooth'` and put the endpoint in `lan_host`:

- Windows: paired SPP port such as `COM5`
- Raspberry Pi/Linux: `/dev/rfcomm0`
- macOS: `/dev/tty.<printer>`

The agent writes raw ESC/POS bytes to that endpoint. If a branch needs local
machine-specific endpoint names, keep the system row stable and override with
`PRINT_BT_TARGETS` or `PRINT_BT_TARGET_<ROLE>`.

## Runtime loops

- **Realtime INSERT** on `print_jobs` (filter: `branch_id=eq.<BRANCH>`)
- **Heartbeat** upsert to `printer_agents` every 30s (`is_online` threshold: 60s)
- **Printer cache refresh** every 5 min
- **Pending drain** every 15s (safety net for missed Realtime events)
- **Stuck-job janitor** every 60s (re-pending `processing` rows older than 5 min)

## Running on Termux (Android) / Raspberry Pi / other Linux

For branches whose POS is an Android tablet (no Windows PC):

```bash
# Termux (Android): install Node 24
pkg install nodejs-lts git

# Clone (or copy just apps/print-agent) and install:
git clone <repo> && cd <repo>/apps/print-agent
pnpm install

# Configure
cp .env.example .env
# ...fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TENANT_ID, AGENT_BRANCH_ID

# Build + run
pnpm build && pnpm start
# Or keep alive under Termux:
#   pkg install termux-services && sv-enable print-agent
```

Same flow on Raspberry Pi / any ARM Linux.

## Troubleshooting

- **"unsupported connection_type"** — use `printers.connection_type='lan'` or
  `'bluetooth'`, or deactivate the row.
- **"missing bluetooth target"** — fill the Bluetooth endpoint in `lan_host` or
  provide a `PRINT_BT_TARGETS` / `PRINT_BT_TARGET_<ROLE>` override.
- **"printer N not in cache / inactive"** — flip `printers.is_active=true` then wait
  up to 5 min, or restart the service.
- **"printer host:port timed out"** — verify the printer is on the same LAN as the
  agent host and reachable on TCP:9100 (try `nc <host> 9100`).
- **Realtime status stuck on `CHANNEL_ERROR`** — check service key validity and
  that `print_jobs` is in the `supabase_realtime` publication.
