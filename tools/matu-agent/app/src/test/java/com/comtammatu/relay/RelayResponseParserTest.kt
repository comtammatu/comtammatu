package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RelayResponseParserTest {
    @Test
    fun `extracts the POS order mapping from a successful relay response`() {
        val mapping = RelayResponseParser.parse(
            """{"success":true,"order_id":9123,"order_number":"POS-00128","display_id":"A128"}"""
        )

        assertEquals(9123L, mapping.orderId)
        assertEquals("POS-00128", mapping.orderNumber)
        assertEquals("A128", mapping.displayId)
        assertFalse(mapping.idempotent)
    }

    @Test
    fun `preserves idempotent status for an existing POS order`() {
        val mapping = RelayResponseParser.parse(
            """{"success":true,"idempotent":true,"order_id":42,"order_number":"POS-00042"}"""
        )

        assertEquals(42L, mapping.orderId)
        assertEquals("POS-00042", mapping.orderNumber)
        assertTrue(mapping.idempotent)
    }
}
