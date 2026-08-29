package com.comtammatu.relay

/** Queue state groups shared by persistence and operator actions. */
object QueueLifecycle {
    const val MANUAL_ENTRY_RESOLUTION = "Thu ngân đã nhập tay"

    val waitingStatuses = listOf(
        OrderQueueDbHelper.STATUS_PENDING,
        OrderQueueDbHelper.STATUS_SENDING,
        OrderQueueDbHelper.STATUS_UNCLASSIFIED
    )

    val resolvedStatuses = listOf(
        OrderQueueDbHelper.STATUS_SENT,
        OrderQueueDbHelper.STATUS_DISMISSED
    )

    val dismissibleStatuses = listOf(
        OrderQueueDbHelper.STATUS_PENDING,
        OrderQueueDbHelper.STATUS_UNCLASSIFIED
    )

    fun canDismiss(status: String): Boolean = status in dismissibleStatuses
}
