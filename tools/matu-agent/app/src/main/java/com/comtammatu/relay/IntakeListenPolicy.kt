package com.comtammatu.relay

/** Listen-socket recovery so one failed bind family cannot leave port 9100 down. */
object IntakeListenPolicy {
    const val REBIND_INITIAL_DELAY_MS = 2_000L
    const val REBIND_MAX_DELAY_MS = 30_000L

    fun shouldRebindAll(siblingStillListening: Boolean): Boolean = !siblingStillListening

    fun shouldKeepRebinding(agentEnabled: Boolean, listening: Boolean): Boolean =
        agentEnabled && !listening

    fun nextRebindDelayMs(attempt: Int): Long {
        val shift = attempt.coerceIn(0, 4)
        return minOf(REBIND_INITIAL_DELAY_MS shl shift, REBIND_MAX_DELAY_MS)
    }
}
