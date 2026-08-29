package com.comtammatu.sunmicompat

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class LoopbackPrintRelay(context: Context) {
    private val queueDirectory = File(context.filesDir, "pending-print-jobs")
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val draining = AtomicBoolean(false)

    fun start() {
        queueDirectory.mkdirs()
        executor.scheduleWithFixedDelay(::drainPending, 0, RETRY_INTERVAL_SECONDS, TimeUnit.SECONDS)
    }

    fun enqueue(payload: ByteArray): Boolean {
        if (payload.isEmpty() || payload.size > MAX_PAYLOAD_BYTES) return false
        queueDirectory.mkdirs()
        if (pendingFiles().size >= MAX_PENDING_JOBS) return false

        val jobName = "%013d-%s.job".format(System.currentTimeMillis(), UUID.randomUUID())
        val destination = File(queueDirectory, jobName)
        val temporary = File(queueDirectory, "$jobName.tmp")
        return try {
            FileOutputStream(temporary).use { stream ->
                stream.write(payload)
                stream.fd.sync()
            }
            if (!temporary.renameTo(destination)) {
                temporary.delete()
                false
            } else {
                executor.execute(::drainPending)
                true
            }
        } catch (error: Exception) {
            temporary.delete()
            Log.e(TAG, "Could not persist a print job", error)
            false
        }
    }

    fun close() {
        executor.shutdownNow()
    }

    private fun drainPending() {
        if (!draining.compareAndSet(false, true)) return
        try {
            for (file in pendingFiles()) {
                val bytes = try {
                    file.readBytes()
                } catch (error: Exception) {
                    Log.e(TAG, "Could not read pending print job ${file.name}", error)
                    break
                }
                if (!send(bytes)) break
                if (!file.delete()) {
                    Log.w(TAG, "Relayed print job remains on disk and may be deduplicated: ${file.name}")
                    break
                }
            }
        } finally {
            draining.set(false)
        }
    }

    private fun pendingFiles(): List<File> =
        queueDirectory.listFiles { file -> file.isFile && file.extension == "job" }
            ?.sortedBy(File::getName)
            .orEmpty()

    private fun send(payload: ByteArray): Boolean = try {
        Socket().use { socket ->
            socket.connect(InetSocketAddress(LOOPBACK_HOST, AGENT_PORT), CONNECT_TIMEOUT_MS)
            socket.soTimeout = WRITE_TIMEOUT_MS
            socket.getOutputStream().use { output ->
                output.write(payload)
                output.flush()
            }
        }
        true
    } catch (error: Exception) {
        Log.w(TAG, "Má Tư Agent is not accepting loopback print jobs yet", error)
        false
    }

    companion object {
        private const val TAG = "MatuSunmiRelay"
        private const val LOOPBACK_HOST = "127.0.0.1"
        private const val AGENT_PORT = 9100
        private const val CONNECT_TIMEOUT_MS = 1_000
        private const val WRITE_TIMEOUT_MS = 3_000
        private const val RETRY_INTERVAL_SECONDS = 5L
        private const val MAX_PENDING_JOBS = 100
        private const val MAX_PAYLOAD_BYTES = 256 * 1024
    }
}
