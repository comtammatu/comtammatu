# Má Tư Agent

Má Tư Agent is a hardware-independent Android ESC/POS virtual-printer bridge. A delivery app sends its normal print stream to TCP port `9100`; the Agent identifies the receipt source and relays it to the Cloud POS through the authenticated delivery webhook. The bundled SUNMI compatibility APK lets current GreenSM Merchant and beMerchant builds discover the Agent through the printer-service contract they already use on SUNMI terminals.

Supported intake sources:

- ShopeeFood
- GreenSM Food
- beFood

The Agent does not depend on SUNMI hardware or forward data to a built-in printer. It can run on an ordinary Android device such as a Redmi Note 13.

## Data flow

```text
GreenSM / beFood -> SUNMI compatibility service -> 127.0.0.1:9100
ShopeeFood / network printer ---------------------> 127.0.0.1:9100
                                                     -> PrintIntakeService
  -> ESC/POS text extraction or bundled on-device OCR for raster receipts
  -> deterministic platform detection
  -> local SQLite queue
  -> /api/webhooks/delivery/relay
  -> POS / KDS
```

Receipts with no unique platform signature are retained locally as `UNCLASSIFIED` and are not sent to the POS. This prevents an unknown receipt from being silently recorded under the wrong platform. On startup, the Agent retries OCR for retained raster receipts and moves successfully classified rows into the normal delivery queue.

## Build

```bash
cd tools/matu-agent
./gradlew assembleDebug
./gradlew testDebugUnitTest
```

The build produces two debug APKs:

- `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk`: the main Agent.
- `tools/matu-agent/sunmi-compat/build/outputs/apk/debug/sunmi-compat-debug.apk`: the GreenSM/beFood auto-discovery companion.

Install both APKs on an ordinary Android device. They must come from the same build/signing key. Do not install the compatibility APK on a SUNMI terminal because SUNMI already owns the system package `woyou.aidlservice.jiuiv5`.

## Configuration

- Backend URL: Cloud POS base URL.
- Branch ID: target branch identifier.
- Delivery Relay Secret: shared authentication secret.
- TCP port: defaults to `9100`.
- LAN mode: disabled by default. Loopback mode binds explicitly to IPv4 `127.0.0.1`; LAN mode binds to `0.0.0.0` for delivery apps on another device.

Keep TCP port `9100` for the direct GreenSM/beFood integration. After both APKs are installed and the main Agent is running, GreenSM and beFood bind to the companion automatically as if the device exposed a SUNMI printer service; no Bluetooth pairing or printer IP is required. The companion groups PrinterX calls by source app, persists completed print streams locally, and retries delivery to the main Agent over `127.0.0.1:9100`. The main Agent remains the only component that classifies, queues, deduplicates, and relays orders to the POS.

Configure apps that use a normal network-printer screen, including ShopeeFood, to use `127.0.0.1:9100` when they run on the same Android device. Use the Agent device's Wi-Fi IP only when LAN mode is intentionally enabled.

The foreground service restarts after boot and retries queued receipts with capped exponential backoff. Legacy queue data is migrated from the previous database filename on first launch.

The app separates operational work into virtual-printer status, waiting/sent
orders, per-platform enablement, diagnostics, and logs. Selecting an order shows
its OCR text, retry state, last failure, and the POS response. A pending order can
be moved to the front of the retry queue from its detail dialog.

When LAN mode is enabled, the Agent advertises `Má Tư Agent` through DNS-SD as a
raw printer (`_pdl-datastream._tcp`) so compatible delivery apps can discover it.
Loopback mode is intentionally not advertised because advertising a Wi-Fi
address while listening only on `127.0.0.1` would expose a printer target that
cannot be reached. Apps that do not support DNS-SD or the supported SUNMI
PrinterX contract still require their own printer configuration. Android cannot
force an unrelated third-party merchant app to adopt a discovered printer.

ShopeeFood currently renders the receipt as a monochrome ESC/POS raster image.
The Agent uses the bundled ML Kit Latin text-recognition model on the phone and
sends the recognized text together with the original ESC/POS bytes. The POS
parses the recognized text; the original bytes remain available for diagnosis.

The virtual printer answers ESC/POS `DLE EOT`, `GS r`, and `GS a` status requests
as a healthy online printer. Status-only connections are not queued as receipts,
and receipt-boundary detection skips binary image and QR payloads before
recognizing paper-cut commands.
