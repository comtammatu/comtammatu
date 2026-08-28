package com.comtammatu.relay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException

/**
 * Network ESC/POS intake for food-delivery apps on the same Android device or LAN.
 */
class PrintIntakeService : Service() {

    companion object {
        private const val TAG = "PrintIntakeService"
        const val DEFAULT_PORT = 9100
        const val CHANNEL_ID = "comtammatu_pos_bridge_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val EXTRA_BACKEND_URL = "EXTRA_BACKEND_URL"
        const val EXTRA_BRANCH_ID = "EXTRA_BRANCH_ID"
        const val EXTRA_SECRET = "EXTRA_SECRET"
        const val EXTRA_PORT = "EXTRA_PORT"
        const val EXTRA_LAN_MODE = "EXTRA_LAN_MODE"

        // SharedPreferences keys shared with MainActivity / BootCompletedReceiver
        const val PREFS_NAME = "bridge_prefs"
        const val KEY_BACKEND_URL = "backend_url"
        const val KEY_BRANCH_ID = "branch_id"
        const val KEY_SECRET = "secret"
        const val KEY_PORT = "port"
        const val KEY_LAN_MODE = "lan_mode"

        const val DEFAULT_BACKEND_URL = "http://localhost:3000"
        const val DEFAULT_BRANCH_ID = 1

        // Intake hardening: cap per-receipt payload and keep a short drain window
        // after the first cut command so a trailing cut sequence is still captured.
        const val MAX_PAYLOAD_BYTES = 256 * 1024
        const val READ_TIMEOUT_MS = 3000
        const val CUT_DRAIN_TIMEOUT_MS = 500

        var isServiceRunning = false
            private set
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var serverSocket: ServerSocket? = null
    private lateinit var dispatcher: WebhookDispatcher
    private lateinit var receiptTextRecognizer: ReceiptTextRecognizer

    override fun onCreate() {
        super.onCreate()
        // Seed the dispatcher from saved config so queue draining works even
        // before the first onStartCommand delivers intent extras.
        val saved = configFromPrefs()
        dispatcher = WebhookDispatcher(this, saved.backendUrl, saved.branchId, saved.secret)
        receiptTextRecognizer = ReceiptTextRecognizer()
        createNotificationChannel()

        // Recover raster-only receipts before entering the normal retry loop.
        serviceScope.launch {
            dispatcher.recoverUnclassifiedReceipts(receiptTextRecognizer)
            dispatcher.startRetryLoop()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            stopServer()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            stopSelf()
            return START_NOT_STICKY
        }

        // START_STICKY restarts deliver a null intent; fall back to the config
        // saved by MainActivity so queued orders keep reaching the real backend.
        val saved = configFromPrefs()
        val backendUrl = intent?.getStringExtra(EXTRA_BACKEND_URL) ?: saved.backendUrl
        val branchId = intent?.getIntExtra(EXTRA_BRANCH_ID, saved.branchId) ?: saved.branchId
        val secret = intent?.getStringExtra(EXTRA_SECRET) ?: saved.secret
        val port = intent?.getIntExtra(EXTRA_PORT, saved.port) ?: saved.port
        val lanMode = intent?.getBooleanExtra(EXTRA_LAN_MODE, saved.lanMode) ?: saved.lanMode

        dispatcher.updateConfig(backendUrl, branchId, secret)

        startForeground(NOTIFICATION_ID, buildForegroundNotification("Đang trực in cổng TCP $port (Pending: ${dispatcher.getPendingCount()})"))
        startServer(port, lanMode)

        return START_STICKY
    }

    private data class BridgeConfig(
        val backendUrl: String,
        val branchId: Int,
        val secret: String,
        val port: Int,
        val lanMode: Boolean
    )

    private fun configFromPrefs(): BridgeConfig {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return BridgeConfig(
            backendUrl = prefs.getString(KEY_BACKEND_URL, DEFAULT_BACKEND_URL) ?: DEFAULT_BACKEND_URL,
            branchId = prefs.getInt(KEY_BRANCH_ID, DEFAULT_BRANCH_ID),
            secret = prefs.getString(KEY_SECRET, "") ?: "",
            port = prefs.getInt(KEY_PORT, DEFAULT_PORT),
            lanMode = prefs.getBoolean(KEY_LAN_MODE, false)
        )
    }

    private fun startServer(port: Int, lanMode: Boolean) {
        if (isServiceRunning) return

        // Bind synchronously so a failed bind never leaves the service in a
        // zombie "running" state. Loopback only by default: the intake port is
        // unauthenticated, so LAN exposure must be explicitly opted into.
        try {
            val bindAddress = InetAddress.getByName(PrinterEndpoint.bindHost(lanMode))
            serverSocket = ServerSocket(port, 50, bindAddress)
            isServiceRunning = true
            Log.i(TAG, "Virtual WiFi Printer Server listening on ${bindAddress.hostAddress}:$port (lanMode=$lanMode)")
            AppLogger.s("MÁY IN ẢO", "Đang mở cổng TCP $port (${if (lanMode) "0.0.0.0 Mạng LAN" else "127.0.0.1 Cục bộ"}). Sẵn sàng nhận đơn!")
        } catch (e: Exception) {
            isServiceRunning = false
            Log.e(TAG, "Failed to bind port $port: ${e.message}", e)
            AppLogger.e("MÁY IN ẢO", "Không mở được cổng TCP $port: ${e.message} (Có thể cổng 9100 đang bị chiếm dụng)")
            startForeground(NOTIFICATION_ID, buildForegroundNotification("⚠️ Không mở được cổng TCP $port: ${e.message}"))
            return
        }

        serviceScope.launch {
            try {
                while (isServiceRunning && serverSocket != null && !serverSocket!!.isClosed) {
                    val clientSocket = serverSocket!!.accept()
                    serviceScope.launch {
                        handleClientConnection(clientSocket)
                    }
                }
            } catch (e: Exception) {
                if (isServiceRunning) {
                    Log.e(TAG, "ServerSocket error: ${e.message}", e)
                    AppLogger.e("MÁY IN ẢO", "Lỗi ServerSocket: ${e.message}")
                }
            }
        }
    }

    private fun handleClientConnection(socket: Socket) {
        val clientAddress = socket.remoteSocketAddress.toString()
        AppLogger.net("Phát hiện kết nối in từ: $clientAddress")
        try {
            socket.soTimeout = READ_TIMEOUT_MS
            val inputStream: InputStream = socket.getInputStream()
            val clientOutput: OutputStream = socket.getOutputStream()
            val buffer = ByteArray(2048)
            val outputStream = ByteArrayOutputStream()
            val statusResponder = EscPosStatusResponder()
            var drainingAfterCut = false

            try {
                while (true) {
                    val bytesRead = inputStream.read(buffer)
                    if (bytesRead == -1) break
                    outputStream.write(buffer, 0, bytesRead)

                    val statusResponses = statusResponder.responsesFor(buffer.copyOf(bytesRead))
                    if (statusResponses.isNotEmpty()) {
                        clientOutput.write(statusResponses)
                        clientOutput.flush()
                        AppLogger.i(
                            "IN ẤN",
                            "Đã phản hồi ${statusResponses.size} truy vấn trạng thái ESC/POS"
                        )
                    }

                    // Reject oversized streams (slow-loris / abuse) before they
                    // grow the in-memory buffer without bound.
                    if (outputStream.size() > MAX_PAYLOAD_BYTES) {
                        Log.e(TAG, "Payload exceeded ${MAX_PAYLOAD_BYTES} bytes from $clientAddress; dropping connection")
                        AppLogger.e("IN ẤN", "Dữ liệu vượt quá giới hạn $MAX_PAYLOAD_BYTES bytes từ $clientAddress")
                        return
                    }

                    // Once a cut command appears, keep a short drain window open so
                    // a trailing cut sequence (double-cut printers) is captured too.
                    if (
                        !drainingAfterCut &&
                        EscPosReceiptBoundary.hasCutCommand(outputStream.toByteArray())
                    ) {
                        drainingAfterCut = true
                        socket.soTimeout = CUT_DRAIN_TIMEOUT_MS
                    }
                }
            } catch (_: SocketTimeoutException) {
                // Inactivity timeout reached, process accumulated payload
            }

            val rawBytes = outputStream.toByteArray()

            if (EscPosStatusResponder.isStatusOnly(rawBytes)) {
                AppLogger.i("IN ẤN", "Kiểm tra trạng thái máy in thành công")
            } else if (rawBytes.isNotEmpty()) {
                Log.i(TAG, "Received ${rawBytes.size} bytes from $clientAddress")
                AppLogger.i("IN ẤN", "Nhận được trọn vẹn luồng in (${rawBytes.size} bytes) từ $clientAddress")

                serviceScope.launch {
                    var receiptText: String? = null
                    var platform = DeliveryPlatformDetector.detect(rawBytes)

                    if (platform == null && EscPosRasterDecoder.decodeLargest(rawBytes) != null) {
                        AppLogger.i("OCR", "Phiếu là ảnh; đang đọc chữ trực tiếp trên thiết bị...")
                        try {
                            receiptText = receiptTextRecognizer.recognize(rawBytes)
                            platform = receiptText?.let(DeliveryPlatformDetector::detect)
                            if (receiptText != null) {
                                AppLogger.s("OCR", "Đã đọc xong nội dung phiếu in bằng OCR")
                            }
                        } catch (error: Exception) {
                            Log.w(TAG, "On-device receipt OCR failed", error)
                            AppLogger.e("OCR", "Không đọc được chữ trên phiếu ảnh: ${error.localizedMessage ?: "lỗi OCR"}")
                        }
                    }

                    if (platform == null) {
                        val queuedId = dispatcher.storeUnclassifiedReceipt(rawBytes, receiptText)
                        AppLogger.e(
                            "PHÂN LOẠI",
                            "Phiếu #$queuedId chưa xác định rõ ShopeeFood, GreenSM Food hay beFood; đã giữ lại và không gửi lên POS."
                        )
                    } else {
                        AppLogger.i("PHÂN LOẠI", "Nhận diện nguồn ${platform.displayName}")
                        dispatcher.dispatchRawReceipt(rawBytes, platform, receiptText)
                    }
                }
            } else {
                AppLogger.w("IN ẤN", "Kết nối từ $clientAddress nhưng không nhận được byte dữ liệu nào")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling client connection: ${e.message}", e)
            AppLogger.e("MẠNG", "Lỗi xử lý kết nối $clientAddress: ${e.message}")
        } finally {
            try {
                socket.close()
            } catch (_: Exception) {}
        }
    }

    private fun stopServer() {
        isServiceRunning = false
        try {
            serverSocket?.close()
            serverSocket = null
            AppLogger.w("MÁY IN ẢO", "Đã đóng cổng lắng nghe máy in")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing serverSocket: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopServer()
        serviceScope.cancel()
        receiptTextRecognizer.close()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Má Tư Agent",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(statusText: String): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("🟢 Má Tư Agent")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setOngoing(true)
            .build()
    }
}
