package com.comtammatu.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrinterWatchdogPolicyTest {
    @Test
    fun `rebinds when the cashier left Agent on but the listen port is down`() {
        assertTrue(
            PrinterWatchdogPolicy.shouldRebind(
                agentEnabled = true,
                probeOk = false,
                listening = false
            )
        )
        assertTrue(
            PrinterWatchdogPolicy.shouldRebind(
                agentEnabled = true,
                probeOk = true,
                listening = false
            )
        )
        assertTrue(
            PrinterWatchdogPolicy.shouldRebind(
                agentEnabled = true,
                probeOk = false,
                listening = true
            )
        )
        assertFalse(
            PrinterWatchdogPolicy.shouldRebind(
                agentEnabled = true,
                probeOk = true,
                listening = true
            )
        )
        assertFalse(
            PrinterWatchdogPolicy.shouldRebind(
                agentEnabled = false,
                probeOk = false,
                listening = false
            )
        )
    }

    @Test
    fun `treats a recent successful probe as a live printer`() {
        assertTrue(PrinterWatchdogPolicy.isFresh(1_000L, 1_000L + 10_000L))
        assertFalse(PrinterWatchdogPolicy.isFresh(1_000L, 1_000L + PrinterWatchdogPolicy.STALE_MS + 1))
        assertFalse(PrinterWatchdogPolicy.isFresh(0L, 10_000L))
    }
}
