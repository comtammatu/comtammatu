package com.comtammatu.relay

/** Cashier-facing queue ordering shared by the ledger UI and unit tests. */
object QueuePresentation {
    fun waitingPriority(status: String): Int = when (status) {
        OrderQueueDbHelper.STATUS_BLOCKED -> 0
        OrderQueueDbHelper.STATUS_UNCLASSIFIED -> 1
        OrderQueueDbHelper.STATUS_PENDING -> 2
        OrderQueueDbHelper.STATUS_SENDING -> 3
        else -> 4
    }

    fun sortWaiting(
        orders: List<OrderQueueDbHelper.QueuedOrder>
    ): List<OrderQueueDbHelper.QueuedOrder> =
        orders.sortedWith(
            compareBy<OrderQueueDbHelper.QueuedOrder> { waitingPriority(it.status) }
                .thenByDescending { it.createdAt }
        )

    fun isActionNeeded(status: String): Boolean =
        status == OrderQueueDbHelper.STATUS_BLOCKED ||
            status == OrderQueueDbHelper.STATUS_UNCLASSIFIED

    fun isInFlight(status: String): Boolean =
        status == OrderQueueDbHelper.STATUS_PENDING ||
            status == OrderQueueDbHelper.STATUS_SENDING

    fun actionNeededCount(orders: List<OrderQueueDbHelper.QueuedOrder>): Int =
        orders.count { isActionNeeded(it.status) }

    fun inFlightCount(orders: List<OrderQueueDbHelper.QueuedOrder>): Int =
        orders.count { isInFlight(it.status) }
}
