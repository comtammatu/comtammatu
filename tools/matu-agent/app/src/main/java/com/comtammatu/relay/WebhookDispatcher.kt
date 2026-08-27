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
 * Includes local SQLite offline queueing with capped exponential backoff retries
 * (orders stay PENDING until delivered) and periodic queue draining.
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
        // Claims older than this are considered abandoned (process died mid-POST)
        // and are released back to PENDING by the retry loop.
        private const val CLAIM_TIMEOUT_MS = 120_000L
    }

    private val dbHelper = OrderQueueDbHelper(context)

    fun updateConfig(backendUrl: String, branchId: Int, relaySecret: String) {
        this.backendUrl = backendUrl.trimEnd('/')
        this.branchId = branchId
        this.relaySecret = relaySecret
    }

    fun getPendingCount(): Int = dbHelper.getPendingCount()

    fun getQueueSummary(): String = dbHelper.getQueueSummary()

    /**
     * Enqueues and dispatches an incoming raw ESC/POS receipt payload.
     */
    suspend fun dispatchRawReceipt(rawBytes: ByteArray, platform: DeliveryPlatform): Result<String> =
        withContext(Dispatchers.IO) {
            val queuedId = dbHelper.enqueueReceipt(rawBytes, branchId, platform.wireValue)
            AppLogger.pos("Đã lưu phiếu #$queuedId vào hàng đợi (${platform.displayName}, ${rawBytes.size} bytes)")

            if (!dbHelper.claimOrder(queuedId)) {
                AppLogger.i("HÀNG ĐỢI", "Đơn #$queuedId đã được vòng lặp retry tiếp nhận")
                return@withContext Result.success("claimed_by_retry_loop")
            }

            AppLogger.pos("Đang chuyển tiếp đơn #$queuedId lên máy chủ POS ($backendUrl)...")
            val base64Payload = android.util.Base64.encodeToString(rawBytes, android.util.Base64.NO_WRAP)
            val result = executePost(base64Payload, branchId, platform.wireValue)

            if (result.isSuccess) {
                dbHelper.markOrderSent(queuedId)
                val body = result.getOrNull() ?: ""
                Log.i(TAG, "Order #$queuedId successfully dispatched to POS: $body")
                AppLogger.s("POS", "Đơn #$queuedId đã gửi thành công lên POS!")
            } else {
                val errorMsg = result.exceptionOrNull()?.message ?: "Lỗi không xác định"
                dbHelper.markOrderFailed(queuedId, 1, errorMsg)
                Log.w(TAG, "Order #$queuedId failed initial dispatch, queued for retry: $errorMsg")
                AppLogger.e("POS", "Gửi đơn #$queuedId thất bại: $errorMsg (Đã xếp hàng chờ retry tự động)")
            }
            result
        }

    fun storeUnclassifiedReceipt(rawBytes: ByteArray): Long = dbHelper.enqueueReceipt(
        rawBytes = rawBytes,
        branchId = branchId,
        platform = "unknown",
        status = OrderQueueDbHelper.STATUS_UNCLASSIFIED,
        lastError = "Không nhận diện được duy nhất một nguồn sàn"
    )

    /**
     * Background loop draining due pending orders from SQLite.
     * Per-order backoff is enforced by next_retry_at in the queue table.
     */
    suspend fun startRetryLoop() = withContext(Dispatchers.IO) {
        while (coroutineContext.isActive) {
            try {
                dbHelper.releaseStaleClaims(CLAIM_TIMEOUT_MS)
                val pendingOrders = dbHelper.getPendingOrders(limit = 10)
                if (pendingOrders.isNotEmpty()) {
                    AppLogger.w("HÀNG ĐỢI", "Phát hiện ${pendingOrders.size} đơn đang chờ gửi lại...")
                }
                for (order in pendingOrders) {
                    if (!coroutineContext.isActive) break
                    if (!dbHelper.claimOrder(order.id)) continue
                    AppLogger.i("RETRY", "Đang thử gửi lại đơn #${order.id} (Lần ${order.retryCount + 1})...")
                    val result = executePost(order.rawBase64, order.branchId, order.platform)
                    if (result.isSuccess) {
                        dbHelper.markOrderSent(order.id)
                        Log.i(TAG, "Queued order #${order.id} sent successfully via retry")
                        AppLogger.s("POS", "Gửi lại thành công đơn #${order.id} lên POS!")
                    } else {
                        val errorMsg = result.exceptionOrNull()?.message
                        dbHelper.markOrderFailed(order.id, order.retryCount + 1, errorMsg)
                        Log.w(TAG, "Queued order #${order.id} retry failed (attempt ${order.retryCount + 1}): $errorMsg")
                        AppLogger.e("RETRY", "Thử lại đơn #${order.id} thất bại: $errorMsg")
                    }
                    delay(1000)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in retry loop: ${e.message}", e)
                AppLogger.e("RETRY", "Lỗi vòng lặp gửi lại: ${e.message}")
            }
            delay(15000) // Poll queue every 15 seconds
        }
    }

    /**
     * Pings the POS Server to verify connectivity and Relay Secret.
     */
    suspend fun pingPosServer(urlTarget: String, secret: String, branch: Int): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                val cleanUrl = urlTarget.trimEnd('/')
                val endpoint = "$cleanUrl/api/webhooks/delivery/relay"
                AppLogger.net("Đang kiểm tra kết nối tới: $endpoint...")

                val url = URL(endpoint)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 8000
                connection.readTimeout = 8000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                if (secret.isNotEmpty()) {
                    connection.setRequestProperty("x-delivery-relay-secret", secret)
                    connection.setRequestProperty("x-shopee-relay-secret", secret)
                }

                val json = JSONObject().apply {
                    put("ping", true)
                    put("branch_id", branch)
                }

                val writer = OutputStreamWriter(connection.outputStream, "UTF-8")
                writer.write(json.toString())
                writer.flush()
                writer.close()

                val code = connection.responseCode
                val responseBody = if (code in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "HTTP $code"
                }

                if (code in 200..299) {
                    AppLogger.s("POS", "Kiểm tra kết nối THÀNH CÔNG! Máy chủ POS phản hồi 200 OK.")
                    Result.success(responseBody)
                } else if (code == 401) {
                    val msg = "LỖI XÁC THỰC 401: Mã Relay Secret không chính xác với máy chủ!"
                    AppLogger.e("POS", msg)
                    Result.failure(Exception(msg))
                } else {
                    val msg = "Máy chủ phản hồi lỗi HTTP $code: $responseBody"
                    AppLogger.e("POS", msg)
                    Result.failure(Exception(msg))
                }
            } catch (e: Exception) {
                val msg = "Không thể kết nối đến máy chủ POS: ${e.localizedMessage ?: e.message}"
                AppLogger.e("MẠNG", msg)
                Result.failure(e)
            }
        }

    private fun executePost(base64Payload: String, branch: Int, platform: String): Result<String> {
        return try {
            val endpoint = "$backendUrl/api/webhooks/delivery/relay"
            val url = URL(endpoint)
            val connection = url.openConnection() as HttpURLConnection

            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            if (relaySecret.isNotEmpty()) {
                connection.setRequestProperty("x-delivery-relay-secret", relaySecret)
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
            } else if (responseCode == 401) {
                Result.failure(Exception("HTTP 401: Sai Relay Secret"))
            } else {
                Result.failure(Exception("HTTP $responseCode: $responseBody"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
