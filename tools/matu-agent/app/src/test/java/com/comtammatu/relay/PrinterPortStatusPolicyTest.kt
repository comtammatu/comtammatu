package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class PrinterPortStatusPolicyTest {
    @Test
    fun `stopped when the cashier turned Agent off`() {
        assertEquals(
            PrinterPortStatus.STOPPED,
            PrinterPortStatusPolicy.resolve(
                agentEnabled = false,
                serviceRunning = false,
                listening = false,
                lastProbeOk = false
            )
        )
        assertEquals(
            PrinterPortStatus.STOPPED,
            PrinterPortStatusPolicy.resolve(
                agentEnabled = false,
                serviceRunning = true,
                listening = true,
                lastProbeOk = true
            )
        )
    }

    @Test
    fun `open only when the current listen and probe are both healthy`() {
        assertEquals(
            PrinterPortStatus.OPEN,
            PrinterPortStatusPolicy.resolve(
                agentEnabled = true,
                serviceRunning = true,
                listening = true,
                lastProbeOk = true
            )
        )
    }

    @Test
    fun `does not treat a stale successful probe as an open port`() {
        assertEquals(
            PrinterPortStatus.RECOVERING,
            PrinterPortStatusPolicy.resolve(
                agentEnabled = true,
                serviceRunning = true,
                listening = false,
                lastProbeOk = true
            )
        )
        assertEquals(
            PrinterPortStatus.RECOVERING,
            PrinterPortStatusPolicy.resolve(
                agentEnabled = true,
                serviceRunning = true,
                listening = true,
                lastProbeOk = false
            )
        )
    }

    @Test
    fun `recovering while Agent stays enabled after a failed bind`() {
        assertEquals(
            PrinterPortStatus.RECOVERING,
            PrinterPortStatusPolicy.resolve(
                agentEnabled = true,
                serviceRunning = false,
                listening = false,
                lastProbeOk = false
            )
        )
    }
}
