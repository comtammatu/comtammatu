package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IntakeConnectionMonitorTest {
    @Test
    fun `last marketplace ignores the Agent port self-check`() {
        IntakeConnectionMonitor.clear()
        IntakeConnectionMonitor.record(
            IntakeConnectionEvent(1L, "127.0.0.1", IntakeConnectionKind.SELF_CHECK, 0)
        )
        assertNull(IntakeConnectionMonitor.lastMarketplace())

        IntakeConnectionMonitor.record(
            IntakeConnectionEvent(2L, "127.0.0.1", IntakeConnectionKind.MARKETPLACE_PROBE, 3)
        )
        assertEquals(
            IntakeConnectionKind.MARKETPLACE_PROBE,
            IntakeConnectionMonitor.lastMarketplace()?.kind
        )

        IntakeConnectionMonitor.record(
            IntakeConnectionEvent(3L, "127.0.0.1", IntakeConnectionKind.MARKETPLACE_JOB, 2400)
        )
        assertEquals(
            IntakeConnectionKind.MARKETPLACE_JOB,
            IntakeConnectionMonitor.lastMarketplace()?.kind
        )
        IntakeConnectionMonitor.clear()
    }
}
