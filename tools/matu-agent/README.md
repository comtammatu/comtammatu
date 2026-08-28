# Má Tư Agent

Má Tư Agent is a hardware-independent Android ESC/POS network-printer bridge. A delivery app sends its normal print stream to TCP port `9100`; the Agent identifies the receipt source and relays it to the Cloud POS through the authenticated delivery webhook.

Supported intake sources:

- ShopeeFood
- GreenSM Food
- beFood

The Agent does not depend on SUNMI hardware or forward data to a built-in printer. It can run on an ordinary Android device such as a Redmi Note 13.

## Data flow

```text
Delivery app -> 127.0.0.1:9100 -> PrintIntakeService
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

The debug APK is written to `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk`.

## Configuration

- Backend URL: Cloud POS base URL.
- Branch ID: target branch identifier.
- Delivery Relay Secret: shared authentication secret.
- TCP port: defaults to `9100`.
- LAN mode: disabled by default. Loopback mode binds explicitly to IPv4 `127.0.0.1`; LAN mode binds to `0.0.0.0` for delivery apps on another device.

Configure each delivery app's network printer to use `127.0.0.1:9100` when it runs on the same Android device. Use the Agent device's Wi-Fi IP only when LAN mode is intentionally enabled.

The foreground service restarts after boot and retries queued receipts with capped exponential backoff. Legacy queue data is migrated from the previous database filename on first launch.

The app separates operational work into virtual-printer status, waiting/sent
orders, per-platform enablement, diagnostics, and logs. Selecting an order shows
its OCR text, retry state, last failure, and the POS response. A pending order can
be moved to the front of the retry queue from its detail dialog.

When LAN mode is enabled, the Agent advertises `Má Tư Agent` through DNS-SD as a
raw printer (`_pdl-datastream._tcp`) so compatible delivery apps can discover it.
Loopback mode is intentionally not advertised because advertising a Wi-Fi
address while listening only on `127.0.0.1` would expose a printer target that
cannot be reached. Apps that do not support DNS-SD still require their own
printer configuration; Android cannot force a third-party merchant app to adopt
a discovered printer.

ShopeeFood currently renders the receipt as a monochrome ESC/POS raster image.
The Agent uses the bundled ML Kit Latin text-recognition model on the phone and
sends the recognized text together with the original ESC/POS bytes. The POS
parses the recognized text; the original bytes remain available for diagnosis.

The virtual printer answers ESC/POS `DLE EOT`, `GS r`, and `GS a` status requests
as a healthy online printer. Status-only connections are not queued as receipts,
and receipt-boundary detection skips binary image and QR payloads before
recognizing paper-cut commands.
