package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GreenSmTransportPolicyTest {
    @Test
    fun `installed Green SM Merchant is Bluetooth or SUNMI and never Agent TCP`() {
        assertEquals(
            GreenSmTransportKind.BLUETOOTH_OR_SUNMI,
            GreenSmTransportPolicy.classify(installed = true)
        )
        assertFalse(GreenSmTransportPolicy.canUseAgentTcpIntake())
        assertFalse(
            GreenSmTransportPolicy.canUseAgentTcpIntake(
                installed = true,
                manufacturer = "Xiaomi",
                brand = "Redmi"
            )
        )
        assertFalse(
            GreenSmTransportPolicy.canUseAgentTcpIntake(
                installed = true,
                manufacturer = "SUNMI",
                brand = "SUNMI"
            )
        )
    }

    @Test
    fun `absent Green SM Merchant is not a TCP marketplace peer`() {
        assertEquals(
            GreenSmTransportKind.ABSENT,
            GreenSmTransportPolicy.classify(installed = false)
        )
        assertTrue(GreenSmTransportPolicy.isXiaomiFamily("Xiaomi", "Redmi"))
        assertEquals("com.gsm.merchant.app", GreenSmTransportPolicy.MERCHANT_PACKAGE)
    }
}
