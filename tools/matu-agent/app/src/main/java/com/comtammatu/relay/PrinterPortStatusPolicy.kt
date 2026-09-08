package com.comtammatu.relay

enum class PrinterPortStatus {
    OPEN,
    RECOVERING,
    STOPPED
}

/**
 * Maps listen-probe health to cashier-facing port status.
 * A fresh lastOkAtMs must not promote OPEN when the listener is down.
 * Agent-enabled with a failed bind stays RECOVERING so watchdog can rebind.
 */
object PrinterPortStatusPolicy {
    fun resolve(
        agentEnabled: Boolean,
        serviceRunning: Boolean,
        listening: Boolean,
        lastProbeOk: Boolean
    ): PrinterPortStatus {
        if (!agentEnabled) return PrinterPortStatus.STOPPED
        return if (serviceRunning && listening && lastProbeOk) {
            PrinterPortStatus.OPEN
        } else {
            PrinterPortStatus.RECOVERING
        }
    }
}
