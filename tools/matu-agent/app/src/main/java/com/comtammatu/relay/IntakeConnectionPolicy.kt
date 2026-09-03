package com.comtammatu.relay

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class IntakeConnectionKind {
    SELF_CHECK,
    MARKETPLACE_PROBE,
    MARKETPLACE_JOB,
    INBOUND_IDLE
}

data class IntakeConnectionEvent(
    val atMs: Long,
    val remoteHost: String,
    val kind: IntakeConnectionKind,
    val byteCount: Int
)

/** Classifies inbound TCP peers so the cashier can tell ShopeeFood from a self-test. */
object IntakeConnectionPolicy {
    fun remoteHost(address: String): String {
        val trimmed = address.trim().removePrefix("/")
        val withoutBrackets = trimmed.removePrefix("[").replace("]:", ":")
        val host = withoutBrackets.substringBeforeLast(":")
        return host.ifBlank { trimmed }
    }

    fun isLoopback(host: String): Boolean {
        val normalized = host.lowercase()
        return normalized == "127.0.0.1" ||
            normalized == "::1" ||
            normalized == "localhost" ||
            normalized == "0:0:0:0:0:0:0:1" ||
            normalized == "::ffff:127.0.0.1"
    }

    fun formatClock(atMs: Long): String =
        SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(atMs))

    fun classify(
        remoteAddress: String,
        bytes: ByteArray,
        sessionEnded: Boolean
    ): IntakeConnectionKind {
        val host = remoteHost(remoteAddress)
        return when {
            bytes.isEmpty() && sessionEnded && isLoopback(host) -> IntakeConnectionKind.SELF_CHECK
            EscPosStatusResponder.isStatusOnly(bytes) -> IntakeConnectionKind.MARKETPLACE_PROBE
            bytes.isNotEmpty() -> IntakeConnectionKind.MARKETPLACE_JOB
            else -> IntakeConnectionKind.INBOUND_IDLE
        }
    }

    fun isMarketplace(kind: IntakeConnectionKind): Boolean =
        kind == IntakeConnectionKind.MARKETPLACE_PROBE ||
            kind == IntakeConnectionKind.MARKETPLACE_JOB
}
