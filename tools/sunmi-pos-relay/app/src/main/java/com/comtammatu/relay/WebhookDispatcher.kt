package com.comtammatu.relay

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.coroutineContext

/**
 * Dispatches captured ESC/POS print streams to Com Tam Ma Tu Cloud POS Webhook.
 * Includes local SQLite offline queueing, exponential backoff, and periodic queue draining.
 */
class WebhookDispatcher(
    context: Context,
    private var backendUrl: String,
    private var branchId: Int,
    private var relaySecret: String
) {
    companion object {
        private const val TAG = "WebhookDispatcher"
        private const val TIMEOUT_MS = 10000
    }

    private val dbHelper = OrderQueueDbHelper(context)

    fun updateConfig(backendUrl: String, branchId: Int, relaySecret: String) {
        this.backendUrl = backendUrl.trimEnd('/')
        this.branchId = branchId
        this.relaySecret = relaySecret
    }

    fun getPendingCount(): Int = dbHelper.getPendingCount()

    /**
     * Enqueues and dispatches an incoming raw ESC/POS receipt payload.
     */
    suspend fun dispatchRawReceipt(rawBytes: ByteArray, platform: String = "shopee"): Result<String> =
        withContext(Dispatchers.IO) {
            val queuedId = dbHelper.enqueueOrder(rawBytes, branchId, platform)
            val base64Payload = android.util.Base64.encodeToString(rawBytes, android.util.Base64.NO_WRAP)
            val result = executePost(base64Payload, branchId, platform)

            if (result.isSuccess) {
                dbHelper.markOrderSent(queuedId)
                Log.i(TAG, "Order #$queuedId successfully dispatched to POS")
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Unknown error"
                dbHelper.markOrderFailed(queuedId, 1, errorMsg)
                Log.w(TAG, "Order #$queuedId failed initial dispatch, queued for retry: $errorMsg")
            }
            result
        }

    /**
     * Background loop draining pending orders from SQLite with exponential backoff.
     */
    suspend fun startRetryLoop() = withContext(Dispatchers.IO) {
        while (coroutineContext.isActive) {
            try {
                val pendingOrders = dbHelper.getPendingOrders(limit = 10)
                for (order in pendingOrders) {
                    if (!coroutineContext.isActive) break
                    val result = executePost(order.rawBase64, order.branchId, order.platform)
                    if (result.isSuccess) {
                        dbHelper.markOrderSent(order.id)
                        Log.i(TAG, "Queued order #${order.id} sent successfully via retry")
                    } else {
                        val errorMsg = result.exceptionOrNull()?.message
                        dbHelper.markOrderFailed(order.id, order.retryCount + 1, errorMsg)
                        Log.w(TAG, "Queued order #${order.id} retry failed (attempt ${order.retryCount + 1}): $errorMsg")
                    }
                    delay(1000)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in retry loop: ${e.message}", e)
            }
            delay(15000) // Poll queue every 15 seconds
        }
    }

    private fun executePost(base64Payload: String, branch: Int, platform: String): Result<String> {
        return try {
            val endpoint = "$backendUrl/api/webhooks/shopeefood/relay"
            val url = URL(endpoint)
            val connection = url.openConnection() as HttpURLConnection

            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            if (relaySecret.isNotEmpty()) {
                connection.setRequestProperty("x-shopee-relay-secret", relaySecret)
            }

            val json = JSONObject().apply {
                put("branch_id", branch)
                put("platform", platform)
                put("raw_bytes_base64", base64Payload)
            }

            val writer = OutputStreamWriter(connection.outputStream, "UTF-8")
            writer.write(json.toString())
            writer.flush()
            writer.close()

            val responseCode = connection.responseCode
            val responseBody = if (responseCode in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $responseCode"
            }

            if (responseCode in 200..299) {
                Result.success(responseBody)
            } else {
                Result.failure(Exception("POS Webhook HTTP $responseCode: $responseBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
