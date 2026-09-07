# Má Tư Agent

Má Tư Agent is a hardware-independent Android ESC/POS bridge for **ShopeeFood**.
ShopeeFood sends its normal print stream to TCP port `9100`. The Agent runs
on-device OCR on raster receipts, classifies the order as ShopeeFood, queues it
locally, and relays it to Cloud POS through the authenticated delivery webhook.
The project builds and distributes exactly one Android application.

Direct intake source:

- ShopeeFood

Unknown receipts stay local as `UNCLASSIFIED` and are not posted. The Agent does
not impersonate SUNMI hardware and does not require a second APK.

## Data flow

```text
ShopeeFood -> 127.0.0.1:9100
           -> PrintIntakeService
           -> ShopeeReceiptPipeline
                ESC/POS text or on-device OCR (ML Kit, upscaled)
                ShopeeFood signature check
           -> local SQLite queue
           -> /api/webhooks/delivery/relay
           -> POS / KDS
```

On startup, the Agent retries OCR for retained raster receipts and moves
successfully classified ShopeeFood rows into the delivery queue.

## Build

```bash
cd tools/matu-agent
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

The build produces one debug APK:

- `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk`

Install only that APK. Remove any earlier package named `woyou.aidlservice.jiuiv5`
that was installed as a compatibility companion on an ordinary Android device.
Never remove the system-owned printer service from a real SUNMI terminal.

## Configuration

- Backend URL: Cloud POS base URL.
- Branch ID: target branch identifier.
- Delivery Relay Secret: shared authentication secret.
- TCP port: defaults to `9100`.
- LAN mode: disabled by default. Loopback binds to IPv4 `127.0.0.1`; LAN mode
  binds to `0.0.0.0` for ShopeeFood on another device.

Configure ShopeeFood to use `127.0.0.1:9100` when it runs on the same Android
device. Use the Agent device's Wi-Fi IP only when LAN mode is enabled.

Agent 1.7.3 uses one long-running `specialUse` foreground service for the
cashier-enabled intake socket. When left enabled, it restarts after boot or APK
replacement, probes `127.0.0.1:9100` every 15s and rebinds if the printer IP
goes silent, keeps a partial wake lock while the socket is live, holds each
accepted printer session until the client hangs up, isolates a single
listen-family failure from a healthy sibling, and retries queued receipts with
capped exponential backoff. Successful sends keep
bitmap and OCR for inspection until the cashier taps cleanup. Android 13+
notification permission is required before intake starts.

On Xiaomi/Redmi, allow Autostart, set battery policy to No restrictions, and
enable floating notifications for the `Đơn mới` channel.

The Material 3 shell has four destinations: Overview, Receipts, Device, and
Logs. Receipt detail keeps bitmap, printable text, and OCR as independent
layers. The ledger retains the Shopee-to-POS mapping for deduplication.

When LAN mode is enabled, the Agent advertises `Má Tư Agent` through DNS-SD as a
raw printer (`_pdl-datastream._tcp`). Loopback mode is not advertised.

ShopeeFood renders the receipt as a monochrome ESC/POS raster. The Agent pads
tone-mark space, upscales a typical thermal width, runs the bundled ML Kit
Latin model, and sends recognized text with the original bytes. The POS parses
the text; the bytes remain for diagnosis.
