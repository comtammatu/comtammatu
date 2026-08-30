# Má Tư Agent

Má Tư Agent is a hardware-independent Android ESC/POS network-printer bridge. A delivery app sends its normal print stream to TCP port `9100`; the Agent identifies the receipt source and relays it to the Cloud POS through the authenticated delivery webhook. The project builds and distributes exactly one Android application.

Supported direct intake source on the Redmi deployment:

- ShopeeFood

The receipt parsers retain Green SM Food and beFood formats for a future supported transport. Current Green SM Merchant selects its Bluetooth flow on Xiaomi/Redmi hardware even when PrinterX finds a compatible service, so the Agent must not claim direct Green SM or beFood discovery on Redmi. The Agent does not impersonate SUNMI hardware and does not require a second APK.

## Data flow

```text
ShopeeFood / supported network-printer client -> 127.0.0.1:9100
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

The build produces one debug APK:

- `tools/matu-agent/app/build/outputs/apk/debug/app-debug.apk`: the main Agent.

Install only the main APK. Remove any earlier package named `woyou.aidlservice.jiuiv5` that was installed as the Má Tư compatibility companion on an ordinary Android device. Never remove the system-owned printer service from a real SUNMI terminal.

## Configuration

- Backend URL: Cloud POS base URL.
- Branch ID: target branch identifier.
- Delivery Relay Secret: shared authentication secret.
- TCP port: defaults to `9100`.
- LAN mode: disabled by default. Loopback mode binds explicitly to IPv4 `127.0.0.1`; LAN mode binds to `0.0.0.0` for delivery apps on another device.

Keep TCP port `9100` for apps that support a raw network-printer target. The main Agent is the only component that classifies, queues, deduplicates, and relays orders to the POS.

Configure ShopeeFood to use `127.0.0.1:9100` when it runs on the same Android device. Use the Agent device's Wi-Fi IP only when LAN mode is intentionally enabled. Green SM Merchant on Redmi currently requires its own Bluetooth printer path; installing Má Tư Agent does not change that application decision.

Agent 1.6.0 uses one long-running `specialUse` foreground service for the cashier-enabled local order-intake socket. When the operator leaves Agent enabled, it restarts after device boot or APK replacement, keeps a partial wake lock while the socket is live, self-recovers an unexpected socket failure, and retries queued receipts with capped exponential backoff. Android 13+ notification permission is required before the UI starts intake. A separate high-importance `Đơn mới` channel produces sound, vibration, and a heads-up card; the low-importance ongoing notification remains the visible proof that the background service is active.

On Xiaomi/Redmi, the operator must also allow Autostart, set the app battery policy to No restrictions, and enable floating notifications for the `Đơn mới` channel. The `Chạy nền trên Redmi` panel opens those settings and can send a test alert. Android deliberately allows the user or device owner to force-stop an app; no ordinary APK can bypass a force-stop. Reopening Agent and tapping `Bật nhận đơn` clears that stopped state. Legacy queue data is migrated from the previous database filename on first launch.

The Material 3 application shell has four primary destinations: Overview,
Receipts, Device, and Logs. Compact phones use a bottom navigation bar; expanded
Android layouts use a navigation rail. Receipts separate Waiting and History,
while Device separates Connection, Background, and Tests so safety-critical
controls do not compete with diagnostic details.

Receipt detail exposes the captured data as three independent layers: the
decoded ESC/POS raster bitmap, printable text extracted directly from the raw
stream, and normalized OCR text. The layer summary reports raw byte count,
bitmap dimensions, and the character counts for text and OCR without substituting
one source for another. Missing layers use explicit empty states.

The ledger retains source-to-POS reference mapping. A pending order can be
retried. When the cashier already entered an order manually, marking it as
manually entered removes it from the active queue while retaining the source
identity and fingerprint for duplicate protection. Cleanup removes heavy
receipt/OCR payloads but retains the reconciliation mapping.

When LAN mode is enabled, the Agent advertises `Má Tư Agent` through DNS-SD as a
raw printer (`_pdl-datastream._tcp`) so compatible delivery apps can discover it.
Loopback mode is intentionally not advertised because advertising a Wi-Fi
address while listening only on `127.0.0.1` would expose a printer target that
cannot be reached. Apps that do not support a network-printer target still
require their own supported printer or integration. Android cannot force an
unrelated third-party merchant app to adopt a discovered printer.

ShopeeFood currently renders the receipt as a monochrome ESC/POS raster image.
The Agent uses the bundled ML Kit Latin text-recognition model on the phone and
sends the recognized text together with the original ESC/POS bytes. The POS
parses the recognized text; the original bytes remain available for diagnosis.

The virtual printer answers ESC/POS `DLE EOT`, `GS r`, and `GS a` status requests
as a healthy online printer. Status-only connections are not queued as receipts,
and receipt-boundary detection skips binary image and QR payloads before
recognizing paper-cut commands.
