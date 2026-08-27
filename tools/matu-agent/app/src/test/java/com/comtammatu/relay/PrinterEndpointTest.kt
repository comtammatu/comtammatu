package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class PrinterEndpointTest {
    @Test
    fun `same-device mode binds explicit IPv4 loopback`() {
        assertEquals("127.0.0.1", PrinterEndpoint.bindHost(lanMode = false))
    }

    @Test
    fun `lan mode binds all IPv4 interfaces`() {
        assertEquals("0.0.0.0", PrinterEndpoint.bindHost(lanMode = true))
    }
}
