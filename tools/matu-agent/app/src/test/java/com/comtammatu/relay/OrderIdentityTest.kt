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
    fun `extracts a September Shopee code when OCR drops the order label`() {
        assertEquals(
            "03096-503466798",
            OrderIdentity.extractSourceOrderRef(
                """
                    ShopeeFood
                    Cơm Tấm Má Tư
                    03096-503466798
                    1. Cơm Sườn Cốt Lết
                """.trimIndent()
            )
        )
    }

    @Test
    fun `extracts a Shopee code after an unaccented OCR order label`() {
        assertEquals(
            "03096-503466798",
            OrderIdentity.extractSourceOrderRef("Ma don hang\n03096-503466798")
        )
    }

    @Test
    fun `extracts a Shopee code when OCR glues trailing customer text onto the same line`() {
        assertEquals(
            "03096-503466798",
            OrderIdentity.extractSourceOrderRef("Mã đơn hàng 03096-503466798 Khách K***")
        )
    }

    @Test
    fun `repairs a leading OCR O in the September date prefix`() {
        assertEquals(
            "01096-541066134",
            OrderIdentity.extractSourceOrderRef("Mã đơn hàng: O1096-541066134")
        )
        assertEquals(
            "6134",
            OrderIdentity.displaySourceOrderRef("shopee", "O1096-541066134")
        )
    }

    @Test
    fun `shows the POS short reference when local OCR missed the source code`() {
        assertEquals(
            "6798",
            OrderIdentity.operatorVisibleOrderRef(
                "shopee",
                null,
                "6798"
            )
        )
    }

    @Test
    fun `keeps the full Shopee reference as identity but displays the final four digits`() {
        val sourceRef = OrderIdentity.extractSourceOrderRef(
            "ShopeeFood\nMã đơn hàng: 29086-503463626"
        )

        assertEquals("29086-503463626", sourceRef)
        assertEquals("3626", OrderIdentity.displaySourceOrderRef("shopee", sourceRef))
    }

    @Test
    fun `does not shorten non-Shopee references`() {
        assertEquals(
            "GSM-829173",
            OrderIdentity.displaySourceOrderRef("greensm", "GSM-829173")
        )
    }

    @Test
    fun `fingerprint is stable for the same bytes and distinct for different bytes`() {
        val first = OrderIdentity.fingerprint("receipt-a".toByteArray())

        assertEquals(first, OrderIdentity.fingerprint("receipt-a".toByteArray()))
        assertNotEquals(first, OrderIdentity.fingerprint("receipt-b".toByteArray()))
    }
}
