package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class QueuePresentationTest {
    @Test
    fun `waiting ledger surfaces operator work before in-flight sends`() {
        val blocked = order(id = 1, status = OrderQueueDbHelper.STATUS_BLOCKED, createdAt = 10)
        val pendingNewer = order(id = 2, status = OrderQueueDbHelper.STATUS_PENDING, createdAt = 40)
        val unclassified = order(id = 3, status = OrderQueueDbHelper.STATUS_UNCLASSIFIED, createdAt = 30)
        val pendingOlder = order(id = 4, status = OrderQueueDbHelper.STATUS_PENDING, createdAt = 20)
        val sending = order(id = 5, status = OrderQueueDbHelper.STATUS_SENDING, createdAt = 50)

        val sorted = QueuePresentation.sortWaiting(
            listOf(pendingNewer, sending, blocked, pendingOlder, unclassified)
        )

        assertEquals(
            listOf(1L, 3L, 2L, 4L, 5L),
            sorted.map { it.id }
        )
    }

    @Test
    fun `home attention splits action-needed from in-flight`() {
        val waiting = listOf(
            order(1, OrderQueueDbHelper.STATUS_BLOCKED, 1),
            order(2, OrderQueueDbHelper.STATUS_UNCLASSIFIED, 2),
            order(3, OrderQueueDbHelper.STATUS_PENDING, 3),
            order(4, OrderQueueDbHelper.STATUS_SENDING, 4)
        )
        assertEquals(2, QueuePresentation.actionNeededCount(waiting))
        assertEquals(2, QueuePresentation.inFlightCount(waiting))
    }

    private fun order(
        id: Long,
        status: String,
        createdAt: Long
    ): OrderQueueDbHelper.QueuedOrder = OrderQueueDbHelper.QueuedOrder(
        id = id,
        rawBase64 = "",
        branchId = 3,
        platform = "shopee",
        receiptText = null,
        retryCount = 0,
        createdAt = createdAt,
        status = status,
        lastError = null,
        nextRetryAt = 0,
        remoteResponse = null,
        sourceOrderRef = null,
        posOrderId = null,
        posOrderNumber = null,
        posDisplayId = null,
        sentAt = 0,
        duplicateCount = 0,
        lastSeenAt = 0,
        idempotent = false,
        resolvedAt = 0,
        resolutionNote = null
    )
}
