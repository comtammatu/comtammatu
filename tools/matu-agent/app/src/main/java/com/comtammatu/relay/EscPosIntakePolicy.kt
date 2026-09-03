package com.comtammatu.relay

/** Idle-timeout decisions for a long-lived ESC/POS printer session. */
object EscPosIntakePolicy {
    const val MAX_EMPTY_KEEPALIVES = 20

    fun shouldKeepListening(accumulated: ByteArray): Boolean =
        accumulated.isEmpty() || EscPosStatusResponder.isStatusOnly(accumulated)

    @Suppress("UNUSED_PARAMETER")
    fun shouldCloseAfterEmptyKeepAlives(
        emptyKeepAlives: Int,
        receivedAnyBytes: Boolean
    ): Boolean = false
}
