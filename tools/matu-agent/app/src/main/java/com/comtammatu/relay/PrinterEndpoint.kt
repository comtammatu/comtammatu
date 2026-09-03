package com.comtammatu.relay

object PrinterEndpoint {
    fun bindHost(lanMode: Boolean): String = if (lanMode) "0.0.0.0" else "127.0.0.1"

    fun bindHosts(lanMode: Boolean): List<String> =
        if (lanMode) listOf("0.0.0.0") else listOf("127.0.0.1", "::1")
}
