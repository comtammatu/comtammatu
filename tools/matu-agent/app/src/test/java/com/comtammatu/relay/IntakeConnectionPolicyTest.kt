package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IntakeConnectionPolicyTest {
    @Test
    fun `treats an empty loopback close as the Agent port self-check`() {
        assertEquals(
            IntakeConnectionKind.SELF_CHECK,
            IntakeConnectionPolicy.classify("/127.0.0.1:51234", byteArrayOf(), sessionEnded = true)
        )
        assertEquals(
            IntakeConnectionKind.SELF_CHECK,
            IntakeConnectionPolicy.classify("/[::1]:51234", byteArrayOf(), sessionEnded = true)
        )
        assertFalse(
            IntakeConnectionPolicy.isMarketplace(
                IntakeConnectionPolicy.classify("/127.0.0.1:1", byteArrayOf(), sessionEnded = true)
            )
        )
    }

    @Test
    fun `treats status probes and receipt bytes as marketplace traffic`() {
        val status = byteArrayOf(0x10, 0x04, 0x01)
        assertEquals(
            IntakeConnectionKind.MARKETPLACE_PROBE,
            IntakeConnectionPolicy.classify("/127.0.0.1:4000", status, sessionEnded = false)
        )
        assertEquals(
            IntakeConnectionKind.MARKETPLACE_JOB,
            IntakeConnectionPolicy.classify(
                "/192.168.1.20:4000",
                byteArrayOf(0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0x80.toByte()),
                sessionEnded = false
            )
        )
        assertTrue(
            IntakeConnectionPolicy.isMarketplace(IntakeConnectionKind.MARKETPLACE_PROBE)
        )
        assertEquals("127.0.0.1", IntakeConnectionPolicy.remoteHost("/127.0.0.1:9101"))
        assertEquals("::1", IntakeConnectionPolicy.remoteHost("/[::1]:9101"))
        assertTrue(IntakeConnectionPolicy.isLoopback("::ffff:127.0.0.1"))
        assertEquals(
            IntakeConnectionKind.INBOUND_IDLE,
            IntakeConnectionPolicy.classify("/192.168.1.20:4000", byteArrayOf(), sessionEnded = true)
        )
    }
}
