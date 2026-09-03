package com.comtammatu.relay

import android.app.Service
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
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
        const val KEY_AGENT_ENABLED = "agent_enabled"
        const val KEY_SHOPEE_ENABLED = "platform_shopee_enabled"

        const val DEFAULT_BACKEND_URL = "http://localhost:3000"
        const val DEFAULT_BRANCH_ID = 0

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
    private lateinit var printerDiscovery: PrinterDiscovery
    private var runtimeWakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        // Seed the dispatcher from saved config so queue draining works even
        // before the first onStartCommand delivers intent extras.
        val saved = configFromPrefs()
        dispatcher = WebhookDispatcher(this, saved.backendUrl, saved.branchId, saved.secret)
        receiptTextRecognizer = ReceiptTextRecognizer()
        printerDiscovery = PrinterDiscovery(this)
        AgentNotifications.ensureChannels(this)

        // Recover unclassified rasters in parallel so OCR cannot delay retries.
        serviceScope.launch {
            dispatcher.recoverUnclassifiedReceipts(
                receiptTextRecognizer,
                ::isPlatformEnabled
            )
        }
        serviceScope.launch {
            dispatcher.startRetryLoop()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_AGENT_ENABLED, false)
                .apply()
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
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_AGENT_ENABLED, false)) {
            AppLogger.i("TRẠNG THÁI", "Agent đang tắt; bỏ qua yêu cầu khởi động lại nền")
            stopSelf()
            return START_NOT_STICKY
        }
        val backendUrl = intent?.getStringExtra(EXTRA_BACKEND_URL) ?: saved.backendUrl
        val branchId = intent?.getIntExtra(EXTRA_BRANCH_ID, saved.branchId) ?: saved.branchId
        val secret = intent?.getStringExtra(EXTRA_SECRET) ?: saved.secret
        val port = intent?.getIntExtra(EXTRA_PORT, saved.port) ?: saved.port
        val lanMode = intent?.getBooleanExtra(EXTRA_LAN_MODE, saved.lanMode) ?: saved.lanMode

        if (branchId <= 0) {
            AppLogger.e("CẤU HÌNH", "Chưa có mã chi nhánh hợp lệ; dịch vụ không được khởi động")
            stopSelf()
            return START_NOT_STICKY
        }

        dispatcher.updateConfig(backendUrl, branchId, secret)

        startForeground(
            AgentNotifications.SERVICE_NOTIFICATION_ID,
            AgentNotifications.buildServiceNotification(
                this,
                "Đang nhận phiếu tại cổng TCP $port · ${dispatcher.getPendingCount()} đang chờ"
            )
        )
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
            acquireRuntimeWakeLock()
            if (lanMode) printerDiscovery.register(port)
            Log.i(TAG, "Print intake server listening on ${bindAddress.hostAddress}:$port (lanMode=$lanMode)")
            AppLogger.s("NHẬN PHIẾU", "Đang mở cổng TCP $port (${if (lanMode) "0.0.0.0 Mạng LAN" else "127.0.0.1 Cục bộ"}). Sẵn sàng nhận đơn!")
        } catch (e: Exception) {
            isServiceRunning = false
            Log.e(TAG, "Failed to bind port $port: ${e.message}", e)
            AppLogger.e("NHẬN PHIẾU", "Không mở được cổng TCP $port: ${e.message} (Có thể cổng 9100 đang bị chiếm dụng)")
            startForeground(
                AgentNotifications.SERVICE_NOTIFICATION_ID,
                AgentNotifications.buildServiceNotification(
                    this,
                    "Không mở được cổng TCP $port; mở Agent để kiểm tra"
                )
            )
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
                    AppLogger.e("NHẬN PHIẾU", "Lỗi cổng nhận phiếu: ${e.message}")
                    restartServerAfterFailure()
                }
            }
        }
    }

    private suspend fun restartServerAfterFailure() {
        isServiceRunning = false
        printerDiscovery.unregister()
        runCatching { serverSocket?.close() }
        serverSocket = null
        releaseRuntimeWakeLock()
        delay(2_000)

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_AGENT_ENABLED, false)) return
        val saved = configFromPrefs()
        AppLogger.w("CHẠY NỀN", "Đang tự mở lại cổng nhận phiếu sau lỗi nền")
        startServer(saved.port, saved.lanMode)
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
                    val hasRaster = EscPosRasterDecoder.hasDecodableRaster(rawBytes)

                    if (AgentOcrPolicy.shouldRunOcr(platform, hasRaster)) {
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
                            "Phiếu #$queuedId chưa xác định được nguồn hỗ trợ; đã giữ lại và không gửi lên POS."
                        )
                    } else if (!isPlatformEnabled(platform)) {
                        val reason = when (platform) {
                            DeliveryPlatform.SHOPEE_FOOD -> "Nguồn ShopeeFood đang tắt trong cấu hình"
                            DeliveryPlatform.GREEN_SM_FOOD -> "Green SM Food chưa hỗ trợ gửi trực tiếp tới Agent trên Redmi"
                            DeliveryPlatform.BE_FOOD -> "beFood chưa hỗ trợ gửi trực tiếp tới Agent trên Redmi"
                        }
                        val queuedId = dispatcher.storeHeldReceipt(
                            rawBytes,
                            platform,
                            receiptText,
                            reason
                        )
                        AppLogger.w(
                            "NGUỒN PHIẾU",
                            "Phiếu #$queuedId thuộc ${platform.displayName}; đã giữ lại vì nguồn này chưa được bật."
                        )
                    } else {
                        AppLogger.i("PHÂN LOẠI", "Nhận diện nguồn ${platform.displayName}")
                        dispatcher.dispatchRawReceipt(
                            rawBytes,
                            platform,
                            receiptText
                        ) { queueId, sourceOrderRef ->
                            AgentNotifications.showIncomingOrder(
                                this@PrintIntakeService,
                                platform,
                                sourceOrderRef,
                                queueId
                            )
                        }
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
        printerDiscovery.unregister()
        releaseRuntimeWakeLock()
        try {
            serverSocket?.close()
            serverSocket = null
            AppLogger.w("NHẬN PHIẾU", "Đã đóng cổng nhận phiếu")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing serverSocket: ${e.message}")
        }
    }

    private fun isPlatformEnabled(platform: DeliveryPlatform): Boolean {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return when (platform) {
            DeliveryPlatform.SHOPEE_FOOD -> prefs.getBoolean(KEY_SHOPEE_ENABLED, true)
            DeliveryPlatform.GREEN_SM_FOOD,
            DeliveryPlatform.BE_FOOD -> false
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopServer()
        serviceScope.cancel()
        receiptTextRecognizer.close()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_AGENT_ENABLED, false)
        ) {
            AppLogger.i("CHẠY NỀN", "Giao diện đã đóng; Agent vẫn tiếp tục nhận đơn")
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("WakelockTimeout")
    private fun acquireRuntimeWakeLock() {
        if (runtimeWakeLock?.isHeld == true) return
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        runtimeWakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "$packageName:OrderIntake"
        ).apply {
            setReferenceCounted(false)
            acquire()
        }
        AppLogger.i("CHẠY NỀN", "Đã giữ tiến trình nhận đơn khi màn hình tắt")
    }

    private fun releaseRuntimeWakeLock() {
        runtimeWakeLock?.let { lock ->
            if (lock.isHeld) lock.release()
        }
        runtimeWakeLock = null
    }
}
