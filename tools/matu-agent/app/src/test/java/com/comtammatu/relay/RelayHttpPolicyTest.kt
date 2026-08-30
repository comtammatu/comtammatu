package com.comtammatu.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RelayHttpPolicyTest {
    @Test
    fun `operator-actionable client failures are terminal`() {
        listOf(400, 401, 403, 409, 422, 426).forEach { status ->
            assertTrue("Expected HTTP $status to be terminal", RelayHttpPolicy.isTerminalFailure(status))
        }
    }

    @Test
    fun `timeouts throttling and server failures remain retryable`() {
        listOf(408, 429, 500, 503).forEach { status ->
            assertFalse("Expected HTTP $status to be retryable", RelayHttpPolicy.isTerminalFailure(status))
        }
    }
}
