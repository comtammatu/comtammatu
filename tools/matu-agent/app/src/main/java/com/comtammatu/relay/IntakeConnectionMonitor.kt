package com.comtammatu.relay

/** In-memory ledger of recent intake peers for the Device diagnostics surface. */
object IntakeConnectionMonitor {
    private const val MAX_EVENTS = 20
    private val events = ArrayList<IntakeConnectionEvent>()

    @Synchronized
    fun record(event: IntakeConnectionEvent) {
        events.add(event)
        if (events.size > MAX_EVENTS) {
            events.removeAt(0)
        }
    }

    @Synchronized
    fun lastMarketplace(): IntakeConnectionEvent? =
        events.lastOrNull { IntakeConnectionPolicy.isMarketplace(it.kind) }

    @Synchronized
    fun snapshot(): List<IntakeConnectionEvent> = ArrayList(events)

    @Synchronized
    fun clear() {
        events.clear()
    }
}
