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
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException

/**
 * Virtual WiFi / LAN Network ESC/POS Thermal Printer Service.
 * Listens on TCP port 9100, receives raw ESC/POS bytes from Shopee Partner (or any food delivery app),
 * forwards stream to SunmiSdkManager for physical receipt printing, and dispatches webhook to Cloud POS.
 */
class VirtualWifiPrinterService : Service() {

    companion object {
        private const val TAG = "VirtualWifiPrinter"
        const val DEFAULT_PORT = 9100
        const val CHANNEL_ID = "comtammatu_pos_bridge_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val EXTRA_BACKEND_URL = "EXTRA_BACKEND_URL"
        const val EXTRA_BRANCH_ID = "EXTRA_BRANCH_ID"
        const val EXTRA_SECRET = "EXTRA_SECRET"
        const val EXTRA_PORT = "EXTRA_PORT"
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private lateinit var sunmiSdk: SunmiSdkManager
    private lateinit var dispatcher: WebhookDispatcher

    override fun onCreate() {
        super.onCreate()
        sunmiSdk = SunmiSdkManager(this)
        sunmiSdk.bindService()
        dispatcher = WebhookDispatcher(this, "http://localhost:3000", 1, "")
        createNotificationChannel()

        // Start background SQLite queue draining loop
        serviceScope.launch {
            dispatcher.startRetryLoop()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            stopServer()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        val backendUrl = intent?.getStringExtra(EXTRA_BACKEND_URL) ?: "http://localhost:3000"
        val branchId = intent?.getIntExtra(EXTRA_BRANCH_ID, 1) ?: 1
        val secret = intent?.getStringExtra(EXTRA_SECRET) ?: ""
        val port = intent?.getIntExtra(EXTRA_PORT, DEFAULT_PORT) ?: DEFAULT_PORT

        dispatcher.updateConfig(backendUrl, branchId, secret)

        startForeground(NOTIFICATION_ID, buildForegroundNotification("Đang trực in cổng TCP $port (Pending: ${dispatcher.getPendingCount()})"))
        startServer(port)

        return START_STICKY
    }

    private fun startServer(port: Int) {
        if (isRunning) return
        isRunning = true

        serviceScope.launch {
            try {
                serverSocket = ServerSocket(port)
                Log.i(TAG, "Virtual WiFi Printer Server listening on port $port")

                while (isRunning && serverSocket != null && !serverSocket!!.isClosed) {
                    val clientSocket = serverSocket!!.accept()
                    serviceScope.launch {
                        handleClientConnection(clientSocket)
                    }
                }
            } catch (e: Exception) {
                if (isRunning) {
                    Log.e(TAG, "ServerSocket error: ${e.message}", e)
                }
            }
        }
    }

    private fun handleClientConnection(socket: Socket) {
        try {
            socket.soTimeout = 3000
            val inputStream: InputStream = socket.getInputStream()
            val buffer = ByteArray(2048)
            val outputStream = ByteArrayOutputStream()

            try {
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    val currentBytes = outputStream.toByteArray()
                    // Check for ESC/POS Cut paper command sequence: GS V (0x1D 0x56) or ESC i / ESC m (0x1B 0x69 / 0x1B 0x6D)
                    if (hasCutPaperSequence(currentBytes)) {
                        break
                    }
                }
            } catch (_: SocketTimeoutException) {
                // Inactivity timeout reached, process accumulated payload
            }

            val rawBytes = outputStream.toByteArray()
            if (rawBytes.isNotEmpty()) {
                Log.i(TAG, "Received ${rawBytes.size} bytes from ${socket.remoteSocketAddress}")

                // 1. Forward raw ESC/POS stream to SUNMI thermal printer for physical receipt
                sunmiSdk.sendRawBytes(rawBytes)

                // 2. Dispatch raw stream to Cloud POS Webhook (with local SQLite queue persistence)
                serviceScope.launch {
                    dispatcher.dispatchRawReceipt(rawBytes, platform = "shopee")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling client connection: ${e.message}", e)
        } finally {
            try {
                socket.close()
            } catch (_: Exception) {}
        }
    }

    private fun hasCutPaperSequence(bytes: ByteArray): Boolean {
        if (bytes.size < 2) return false
        for (i in 0 until bytes.size - 1) {
            val b1 = bytes[i].toInt() and 0xFF
            val b2 = bytes[i + 1].toInt() and 0xFF
            if ((b1 == 0x1D && b2 == 0x56) || (b1 == 0x1B && (b2 == 0x69 || b2 == 0x6D))) {
                return true
            }
        }
        return false
    }

    private fun stopServer() {
        isRunning = false
        try {
            serverSocket?.close()
            serverSocket = null
        } catch (e: Exception) {
            Log.e(TAG, "Error closing serverSocket: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopServer()
        sunmiSdk.unbindService()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Cơm Tấm Má Tư POS Bridge Service",
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
            .setContentTitle("🟢 Cơm Tấm Má Tư POS Bridge")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setOngoing(true)
            .build()
    }
}
