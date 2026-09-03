package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IntakeListenPolicyTest {
    @Test
    fun `does not tear down a healthy sibling listen address`() {
        assertFalse(IntakeListenPolicy.shouldRebindAll(siblingStillListening = true))
        assertTrue(IntakeListenPolicy.shouldRebindAll(siblingStillListening = false))
    }

    @Test
    fun `keeps rebinding the listen port while the cashier left Agent enabled`() {
        assertTrue(
            IntakeListenPolicy.shouldKeepRebinding(agentEnabled = true, listening = false)
        )
        assertFalse(
            IntakeListenPolicy.shouldKeepRebinding(agentEnabled = true, listening = true)
        )
        assertFalse(
            IntakeListenPolicy.shouldKeepRebinding(agentEnabled = false, listening = false)
        )
        assertEquals(2_000L, IntakeListenPolicy.nextRebindDelayMs(0))
        assertEquals(8_000L, IntakeListenPolicy.nextRebindDelayMs(2))
        assertEquals(30_000L, IntakeListenPolicy.nextRebindDelayMs(8))
    }
}
