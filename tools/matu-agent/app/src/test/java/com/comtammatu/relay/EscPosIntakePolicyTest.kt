package com.comtammatu.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EscPosIntakePolicyTest {
    @Test
    fun `keeps the printer session open after a status probe or empty idle`() {
        assertTrue(
            EscPosIntakePolicy.shouldKeepListening(
                byteArrayOf(0x10, 0x04, 0x01, 0x10, 0x04, 0x04)
            )
        )
        assertTrue(EscPosIntakePolicy.shouldKeepListening(byteArrayOf()))
        assertFalse(
            EscPosIntakePolicy.shouldCloseAfterEmptyKeepAlives(
                emptyKeepAlives = 3,
                receivedAnyBytes = false
            )
        )
        assertFalse(
            EscPosIntakePolicy.shouldCloseAfterEmptyKeepAlives(
                emptyKeepAlives = EscPosIntakePolicy.MAX_EMPTY_KEEPALIVES,
                receivedAnyBytes = false
            )
        )
        assertFalse(
            EscPosIntakePolicy.shouldCloseAfterEmptyKeepAlives(
                emptyKeepAlives = EscPosIntakePolicy.MAX_EMPTY_KEEPALIVES,
                receivedAnyBytes = true
            )
        )
        assertFalse(
            EscPosIntakePolicy.shouldCloseAfterEmptyKeepAlives(
                emptyKeepAlives = 100,
                receivedAnyBytes = true
            )
        )
    }

    @Test
    fun `processes a receipt after idle when non-status bytes have arrived`() {
        assertFalse(
            EscPosIntakePolicy.shouldKeepListening(
                byteArrayOf(0x10, 0x04, 0x01) + "ShopeeFood".toByteArray()
            )
        )
        assertFalse(
            EscPosIntakePolicy.shouldKeepListening(
                byteArrayOf(0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0x80.toByte())
            )
        )
    }
}
