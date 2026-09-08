package com.comtammatu.relay

data class PrinterHealthSnapshot(
    val listening: Boolean,
    val lastProbeOk: Boolean,
    val lastOkAtMs: Long
)

object PrinterHealth {
    @Volatile
    var listening: Boolean = false
        private set

    @Volatile
    var lastProbeOk: Boolean = false
        private set

    @Volatile
    var lastOkAtMs: Long = 0L
        private set

    fun recordListen(listening: Boolean) {
        this.listening = listening
        if (listening) {
            lastProbeOk = true
            lastOkAtMs = System.currentTimeMillis()
        }
    }

    fun recordProbe(ok: Boolean, atMs: Long) {
        lastProbeOk = ok
        if (ok) lastOkAtMs = atMs
    }

    fun snapshot(): PrinterHealthSnapshot =
        PrinterHealthSnapshot(listening, lastProbeOk, lastOkAtMs)

    fun reset() {
        listening = false
        lastProbeOk = false
        lastOkAtMs = 0L
    }
}

/** Periodic 127.0.0.1:9100 probe so ShopeeFood does not lose the printer IP. */
object PrinterWatchdogPolicy {
    const val INTERVAL_MS = 15_000L
    const val PROBE_TIMEOUT_MS = 1_200
    const val STALE_MS = 45_000L

    /** False when the cashier stopped intake; the 15s loop must not rebind. */
    fun shouldRebind(agentEnabled: Boolean, probeOk: Boolean, listening: Boolean): Boolean =
        agentEnabled && (!probeOk || !listening)

    fun isFresh(lastOkAtMs: Long, nowMs: Long): Boolean =
        lastOkAtMs > 0L && nowMs - lastOkAtMs <= STALE_MS
}
