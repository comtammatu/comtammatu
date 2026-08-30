package com.comtammatu.relay

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentLifecyclePolicyTest {
    @Test
    fun `starts after boot or package replacement only when configured and enabled`() {
        assertTrue(
            AgentLifecyclePolicy.shouldAutoStart(
                "android.intent.action.BOOT_COMPLETED",
                enabled = true,
                branchId = 3
            )
        )
        assertTrue(
            AgentLifecyclePolicy.shouldAutoStart(
                "android.intent.action.MY_PACKAGE_REPLACED",
                enabled = true,
                branchId = 3
            )
        )
        assertFalse(
            AgentLifecyclePolicy.shouldAutoStart(
                "android.intent.action.BOOT_COMPLETED",
                enabled = false,
                branchId = 3
            )
        )
        assertFalse(
            AgentLifecyclePolicy.shouldAutoStart(
                "android.intent.action.BOOT_COMPLETED",
                enabled = true,
                branchId = 0
            )
        )
        assertFalse(
            AgentLifecyclePolicy.shouldAutoStart(
                "android.intent.action.USER_PRESENT",
                enabled = true,
                branchId = 3
            )
        )
    }
}
