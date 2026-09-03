package com.comtammatu.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentNavigationPolicyTest {
    @Test
    fun `ignores bar selection callbacks fired while syncing the selected item`() {
        assertTrue(AgentNavigationPolicy.shouldHandleItemSelection(false))
        assertFalse(AgentNavigationPolicy.shouldHandleItemSelection(true))
    }
}
