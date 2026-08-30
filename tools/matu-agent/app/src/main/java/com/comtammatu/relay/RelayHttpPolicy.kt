package com.comtammatu.relay

/** Separates operator-actionable client failures from transport/server retries. */
object RelayHttpPolicy {
    fun isTerminalFailure(statusCode: Int): Boolean =
        statusCode in 400..499 && statusCode != 408 && statusCode != 429
}

class RelayTerminalException(
    val statusCode: Int,
    message: String
) : Exception(message)
