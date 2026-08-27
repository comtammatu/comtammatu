package com.comtammatu.relay

object PrinterEndpoint {
    fun bindHost(lanMode: Boolean): String = if (lanMode) "0.0.0.0" else "127.0.0.1"
}
