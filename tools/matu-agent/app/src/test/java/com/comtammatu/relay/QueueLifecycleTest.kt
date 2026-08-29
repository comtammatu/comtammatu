package com.comtammatu.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QueueLifecycleTest {
    @Test
    fun `manual entry is resolved and no longer waiting`() {
        assertTrue(OrderQueueDbHelper.STATUS_DISMISSED in QueueLifecycle.resolvedStatuses)
        assertFalse(OrderQueueDbHelper.STATUS_DISMISSED in QueueLifecycle.waitingStatuses)
    }

    @Test
    fun `only unclaimed waiting receipts can be marked as manually entered`() {
        assertTrue(QueueLifecycle.canDismiss(OrderQueueDbHelper.STATUS_PENDING))
        assertTrue(QueueLifecycle.canDismiss(OrderQueueDbHelper.STATUS_UNCLASSIFIED))
        assertFalse(QueueLifecycle.canDismiss(OrderQueueDbHelper.STATUS_SENDING))
        assertFalse(QueueLifecycle.canDismiss(OrderQueueDbHelper.STATUS_SENT))
    }
}
