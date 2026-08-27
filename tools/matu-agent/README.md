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
  -> deterministic platform detection
  -> local SQLite queue
  -> /api/webhooks/delivery/relay
  -> POS / KDS
```

Receipts with no unique platform signature are retained locally as `UNCLASSIFIED` and are not sent to the POS. This prevents an unknown receipt from being silently recorded under the wrong platform.

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
