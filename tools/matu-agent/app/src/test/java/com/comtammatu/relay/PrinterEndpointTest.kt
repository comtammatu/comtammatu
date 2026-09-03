package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class PrinterEndpointTest {
    @Test
    fun `same-device mode binds explicit IPv4 loopback`() {
        assertEquals("127.0.0.1", PrinterEndpoint.bindHost(lanMode = false))
    }

    @Test
    fun `same-device mode also listens on IPv6 loopback`() {
        assertEquals(listOf("127.0.0.1", "::1"), PrinterEndpoint.bindHosts(lanMode = false))
    }

    @Test
    fun `lan mode binds all IPv4 interfaces`() {
        assertEquals("0.0.0.0", PrinterEndpoint.bindHost(lanMode = true))
        assertEquals(listOf("0.0.0.0"), PrinterEndpoint.bindHosts(lanMode = true))
    }
}
