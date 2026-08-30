package com.comtammatu.relay

/** Pure lifecycle decisions shared by boot/package receivers and unit tests. */
object AgentLifecyclePolicy {
    private val supportedActions = setOf(
        "android.intent.action.BOOT_COMPLETED",
        "android.intent.action.MY_PACKAGE_REPLACED"
    )

    fun shouldAutoStart(action: String?, enabled: Boolean, branchId: Int): Boolean =
        action in supportedActions && enabled && branchId > 0
}
