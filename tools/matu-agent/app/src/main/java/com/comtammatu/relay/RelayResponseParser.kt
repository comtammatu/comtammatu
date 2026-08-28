package com.comtammatu.relay

import org.json.JSONObject

data class PosOrderMapping(
    val orderId: Long?,
    val orderNumber: String?,
    val displayId: String?,
    val idempotent: Boolean
)

object RelayResponseParser {
    fun parse(responseBody: String?): PosOrderMapping {
        if (responseBody.isNullOrBlank()) return PosOrderMapping(null, null, null, false)
        return try {
            val json = JSONObject(responseBody)
            PosOrderMapping(
                orderId = json.optLong("order_id").takeIf { json.has("order_id") && !json.isNull("order_id") },
                orderNumber = json.optString("order_number").trim().ifBlank { null },
                displayId = json.optString("display_id").trim().ifBlank { null },
                idempotent = json.optBoolean("idempotent", false)
            )
        } catch (_: Exception) {
            PosOrderMapping(null, null, null, false)
        }
    }
}
