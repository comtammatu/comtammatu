package com.comtammatu.relay

import android.os.Handler
import android.os.Looper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Thread-safe central logger for Má Tư POS Bridge.
 * Keeps recent log lines in a ring buffer in memory and broadcasts
 * new entries to active UI listeners on the Main Thread.
 */
object AppLogger {

    private const val MAX_LOGS = 150
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    private val mainHandler = Handler(Looper.getMainLooper())

    private val logList = ArrayList<String>()
    private val listeners = ArrayList<(String) -> Unit>()

    @Synchronized
    fun log(tag: String, message: String) {
        val timeStr = timeFormat.format(Date())
        val entry = "[$timeStr] $tag: $message"

        logList.add(entry)
        if (logList.size > MAX_LOGS) {
            logList.removeAt(0)
        }

        // Notify UI listeners on Main thread
        mainHandler.post {
            synchronized(this) {
                for (listener in listeners) {
                    listener(entry)
                }
            }
        }
    }

    fun i(tag: String, message: String) = log("ℹ️ $tag", message)
    fun s(tag: String, message: String) = log("🟢 $tag", message)
    fun w(tag: String, message: String) = log("🟡 $tag", message)
    fun e(tag: String, message: String) = log("🔴 $tag", message)
    fun print(message: String) = log("🖨️ IN ẤN", message)
    fun pos(message: String) = log("🚀 POS", message)
    fun net(message: String) = log("🌐 MẠNG", message)

    @Synchronized
    fun getAllLogs(): List<String> {
        return ArrayList(logList)
    }

    @Synchronized
    fun clear() {
        logList.clear()
        mainHandler.post {
            synchronized(this) {
                for (listener in listeners) {
                    listener("--- Đã xóa nhật ký ---")
                }
            }
        }
    }

    @Synchronized
    fun addListener(listener: (String) -> Unit) {
        if (!listeners.contains(listener)) {
            listeners.add(listener)
        }
    }

    @Synchronized
    fun removeListener(listener: (String) -> Unit) {
        listeners.remove(listener)
    }
}
