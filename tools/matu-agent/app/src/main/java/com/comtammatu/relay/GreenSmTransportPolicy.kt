package com.comtammatu.relay

import android.content.pm.PackageManager

enum class GreenSmTransportKind {
    ABSENT,
    BLUETOOTH_OR_SUNMI
}

/**
 * Green SM Merchant on Xiaomi/Redmi selects Bluetooth or SUNMI. A phone cannot
 * pair with itself as a Bluetooth printer, so same-device Agent TCP 9100 is
 * not a Green SM intake path.
 */
object GreenSmTransportPolicy {
    const val MERCHANT_PACKAGE = "com.gsm.merchant.app"

    fun classify(installed: Boolean): GreenSmTransportKind =
        if (installed) GreenSmTransportKind.BLUETOOTH_OR_SUNMI
        else GreenSmTransportKind.ABSENT

    fun isXiaomiFamily(manufacturer: String, brand: String): Boolean {
        val haystack = "$manufacturer $brand".lowercase()
        return listOf("xiaomi", "redmi", "poco").any(haystack::contains)
    }

    fun canUseAgentTcpIntake(
        installed: Boolean = false,
        manufacturer: String = "",
        brand: String = ""
    ): Boolean {
        if (!installed) return false
        if (isXiaomiFamily(manufacturer, brand)) return false
        // Fail closed on every other manufacturer until a live TCP path is proven.
        return false
    }

    fun isMerchantInstalled(packageManager: PackageManager): Boolean =
        runCatching {
            @Suppress("DEPRECATION")
            packageManager.getPackageInfo(MERCHANT_PACKAGE, 0)
        }.isSuccess
}
