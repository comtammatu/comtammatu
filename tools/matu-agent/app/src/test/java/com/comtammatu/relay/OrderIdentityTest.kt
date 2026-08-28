package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotEquals
import org.junit.Test

class OrderIdentityTest {
    @Test
    fun `extracts an inline source order reference`() {
        assertEquals(
            "28086-616906507",
            OrderIdentity.extractSourceOrderRef(
                """
                    ShopeeFood
                    Mã đơn hàng: 28086-616906507
                    1x Trà Tắc 20.000
                """.trimIndent()
            )
        )
    }

    @Test
    fun `extracts a source order reference from the following line`() {
        assertEquals(
            "GSM-829173",
            OrderIdentity.extractSourceOrderRef("Mã đơn hàng\nGSM-829173")
        )
    }

    @Test
    fun `does not invent an identity when a receipt has no order reference`() {
        assertNull(OrderIdentity.extractSourceOrderRef("Cơm Sườn\nTổng tiền 65.000đ"))
    }

    @Test
    fun `fingerprint is stable for the same bytes and distinct for different bytes`() {
        val first = OrderIdentity.fingerprint("receipt-a".toByteArray())

        assertEquals(first, OrderIdentity.fingerprint("receipt-a".toByteArray()))
        assertNotEquals(first, OrderIdentity.fingerprint("receipt-b".toByteArray()))
    }
}
