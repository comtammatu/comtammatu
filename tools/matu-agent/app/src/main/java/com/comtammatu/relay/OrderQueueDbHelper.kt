package com.comtammatu.relay

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Base64
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * SQLite Database Helper for offline print receipt queueing and retrying.
 * Orders stay PENDING until delivered; failed attempts schedule the next retry
 * via capped exponential backoff so no order is ever abandoned. A row is
 * atomically claimed (PENDING -> SENDING) before each POST so the initial
 * dispatch and the retry loop can never send the same order concurrently.
 */
class OrderQueueDbHelper(context: Context) : SQLiteOpenHelper(
    context,
    prepareDatabase(context),
    null,
    DATABASE_VERSION
) {

    companion object {
        const val DATABASE_NAME = "matu_agent_queue.db"
        private const val LEGACY_DATABASE_NAME = "sunmi_relay_queue.db"
        const val DATABASE_VERSION = 4

        const val TABLE_ORDERS = "queued_orders"
        const val COLUMN_ID = "id"
        const val COLUMN_RAW_BASE64 = "raw_base64"
        const val COLUMN_RECEIPT_TEXT = "receipt_text"
        const val COLUMN_BRANCH_ID = "branch_id"
        const val COLUMN_PLATFORM = "platform"
        const val COLUMN_STATUS = "status" // PENDING, SENDING, SENT, UNCLASSIFIED
        const val COLUMN_RETRY_COUNT = "retry_count"
        const val COLUMN_CREATED_AT = "created_at"
        const val COLUMN_LAST_ERROR = "last_error"
        const val COLUMN_NEXT_RETRY_AT = "next_retry_at"
        const val COLUMN_CLAIMED_AT = "claimed_at"

        const val STATUS_PENDING = "PENDING"
        const val STATUS_SENDING = "SENDING"
        const val STATUS_SENT = "SENT"
        const val STATUS_UNCLASSIFIED = "UNCLASSIFIED"

        const val RETRY_BASE_DELAY_MS = 15_000L
        const val RETRY_MAX_DELAY_MS = 15 * 60 * 1000L

        /** Capped exponential backoff: 15s, 30s, 60s ... capped at 15 minutes. */
        fun nextRetryDelay(retryCount: Int): Long {
            val shift = retryCount.coerceIn(0, 6)
            return (RETRY_BASE_DELAY_MS shl shift).coerceAtMost(RETRY_MAX_DELAY_MS)
        }

        private fun prepareDatabase(context: Context): String {
            val target = context.getDatabasePath(DATABASE_NAME)
            val legacy = context.getDatabasePath(LEGACY_DATABASE_NAME)
            if (!target.exists() && legacy.exists()) {
                target.parentFile?.mkdirs()
                if (!legacy.renameTo(target)) {
                    return LEGACY_DATABASE_NAME
                }
                listOf("-wal", "-shm", "-journal").forEach { suffix ->
                    val legacySidecar = context.getDatabasePath(LEGACY_DATABASE_NAME + suffix)
                    if (legacySidecar.exists()) {
                        legacySidecar.renameTo(context.getDatabasePath(DATABASE_NAME + suffix))
                    }
                }
            }
            return DATABASE_NAME
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE $TABLE_ORDERS (
                $COLUMN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_RAW_BASE64 TEXT NOT NULL,
                $COLUMN_RECEIPT_TEXT TEXT,
                $COLUMN_BRANCH_ID INTEGER NOT NULL,
                $COLUMN_PLATFORM TEXT NOT NULL,
                $COLUMN_STATUS TEXT NOT NULL,
                $COLUMN_RETRY_COUNT INTEGER DEFAULT 0,
                $COLUMN_CREATED_AT INTEGER NOT NULL,
                $COLUMN_LAST_ERROR TEXT,
                $COLUMN_NEXT_RETRY_AT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_CLAIMED_AT INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_NEXT_RETRY_AT INTEGER NOT NULL DEFAULT 0")
        }
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_CLAIMED_AT INTEGER NOT NULL DEFAULT 0")
        }
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_RECEIPT_TEXT TEXT")
        }
    }

    fun enqueueReceipt(
        rawBytes: ByteArray,
        branchId: Int,
        platform: String,
        receiptText: String? = null,
        status: String = STATUS_PENDING,
        lastError: String? = null
    ): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_RAW_BASE64, Base64.encodeToString(rawBytes, Base64.NO_WRAP))
            put(COLUMN_RECEIPT_TEXT, receiptText)
            put(COLUMN_BRANCH_ID, branchId)
            put(COLUMN_PLATFORM, platform)
            put(COLUMN_STATUS, status)
            put(COLUMN_RETRY_COUNT, 0)
            put(COLUMN_CREATED_AT, System.currentTimeMillis())
            put(COLUMN_LAST_ERROR, lastError)
        }
        return db.insert(TABLE_ORDERS, null, values)
    }

    fun markOrderSent(orderId: Long) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_SENT)
        }
        db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
    }

    /**
     * Atomically claims a PENDING order for delivery. Returns false when another
     * dispatcher path already claimed it, so callers must skip the POST.
     */
    fun claimOrder(orderId: Long): Boolean {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_SENDING)
            put(COLUMN_CLAIMED_AT, System.currentTimeMillis())
        }
        val updated = db.update(
            TABLE_ORDERS,
            values,
            "$COLUMN_ID = ? AND $COLUMN_STATUS = ?",
            arrayOf(orderId.toString(), STATUS_PENDING)
        )
        return updated > 0
    }

    /**
     * Reverts SENDING rows whose claim outlived the timeout (e.g. process died
     * mid-POST) back to PENDING so they are retried instead of stranded.
     */
    fun releaseStaleClaims(claimTimeoutMs: Long) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_PENDING)
        }
        db.update(
            TABLE_ORDERS,
            values,
            "$COLUMN_STATUS = ? AND $COLUMN_CLAIMED_AT < ?",
            arrayOf(STATUS_SENDING, (System.currentTimeMillis() - claimTimeoutMs).toString())
        )
    }

    fun markOrderFailed(orderId: Long, retryCount: Int, errorMessage: String?) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_PENDING)
            put(COLUMN_RETRY_COUNT, retryCount)
            put(COLUMN_LAST_ERROR, errorMessage)
            put(COLUMN_NEXT_RETRY_AT, System.currentTimeMillis() + nextRetryDelay(retryCount))
        }
        db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
    }

    data class QueuedOrder(
        val id: Long,
        val rawBase64: String,
        val branchId: Int,
        val platform: String,
        val receiptText: String?,
        val retryCount: Int,
        val createdAt: Long
    )

    fun getPendingOrders(limit: Int = 20): List<QueuedOrder> {
        val list = mutableListOf<QueuedOrder>()
        val db = readableDatabase
        val cursor = db.query(
            TABLE_ORDERS,
            null,
            "$COLUMN_STATUS = ? AND $COLUMN_NEXT_RETRY_AT <= ?",
            arrayOf(STATUS_PENDING, System.currentTimeMillis().toString()),
            null,
            null,
            "$COLUMN_CREATED_AT ASC",
            limit.toString()
        )

        cursor.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(c.getColumnIndexOrThrow(COLUMN_ID))
                val raw = c.getString(c.getColumnIndexOrThrow(COLUMN_RAW_BASE64))
                val branchId = c.getInt(c.getColumnIndexOrThrow(COLUMN_BRANCH_ID))
                val platform = c.getString(c.getColumnIndexOrThrow(COLUMN_PLATFORM))
                val receiptText = c.getString(c.getColumnIndexOrThrow(COLUMN_RECEIPT_TEXT))
                val retryCount = c.getInt(c.getColumnIndexOrThrow(COLUMN_RETRY_COUNT))
                val createdAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_CREATED_AT))

                list.add(QueuedOrder(id, raw, branchId, platform, receiptText, retryCount, createdAt))
            }
        }
        return list
    }

    fun getRecoverableRasterOrders(limit: Int = 5): List<QueuedOrder> {
        val list = mutableListOf<QueuedOrder>()
        val db = readableDatabase
        val cursor = db.query(
            TABLE_ORDERS,
            null,
            "$COLUMN_STATUS = ? OR ($COLUMN_STATUS = ? AND $COLUMN_RECEIPT_TEXT IS NOT NULL)",
            arrayOf(STATUS_UNCLASSIFIED, STATUS_PENDING),
            null,
            null,
            "$COLUMN_CREATED_AT ASC",
            limit.toString()
        )

        cursor.use { c ->
            while (c.moveToNext()) {
                list.add(
                    QueuedOrder(
                        id = c.getLong(c.getColumnIndexOrThrow(COLUMN_ID)),
                        rawBase64 = c.getString(c.getColumnIndexOrThrow(COLUMN_RAW_BASE64)),
                        branchId = c.getInt(c.getColumnIndexOrThrow(COLUMN_BRANCH_ID)),
                        platform = c.getString(c.getColumnIndexOrThrow(COLUMN_PLATFORM)),
                        receiptText = c.getString(c.getColumnIndexOrThrow(COLUMN_RECEIPT_TEXT)),
                        retryCount = c.getInt(c.getColumnIndexOrThrow(COLUMN_RETRY_COUNT)),
                        createdAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_CREATED_AT))
                    )
                )
            }
        }
        return list
    }

    fun reclassifyOrder(orderId: Long, platform: String, receiptText: String): Boolean {
        val values = ContentValues().apply {
            put(COLUMN_PLATFORM, platform)
            put(COLUMN_RECEIPT_TEXT, receiptText)
            put(COLUMN_STATUS, STATUS_PENDING)
            putNull(COLUMN_LAST_ERROR)
            put(COLUMN_NEXT_RETRY_AT, 0)
        }
        return writableDatabase.update(
            TABLE_ORDERS,
            values,
            "$COLUMN_ID = ? AND $COLUMN_STATUS IN (?, ?)",
            arrayOf(orderId.toString(), STATUS_UNCLASSIFIED, STATUS_PENDING)
        ) > 0
    }

    fun getPendingCount(): Int {
        val db = readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_ORDERS WHERE $COLUMN_STATUS = ?", arrayOf(STATUS_PENDING))
        return cursor.use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun getQueueSummary(): String {
        val db = readableDatabase
        var pending = 0
        var sending = 0
        var sent = 0
        var unclassified = 0
        var total = 0

        val countCursor = db.rawQuery("SELECT $COLUMN_STATUS, COUNT(*) FROM $TABLE_ORDERS GROUP BY $COLUMN_STATUS", null)
        countCursor.use { c ->
            while (c.moveToNext()) {
                val status = c.getString(0)
                val count = c.getInt(1)
                total += count
                when (status) {
                    STATUS_PENDING -> pending = count
                    STATUS_SENDING -> sending = count
                    STATUS_SENT -> sent = count
                    STATUS_UNCLASSIFIED -> unclassified = count
                }
            }
        }

        val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        val sb = StringBuilder()
        sb.append("📊 TỔNG KẾT HÀNG ĐỢI OFFLINE (SQLite):\n")
        sb.append("• Tổng số đơn đã nhận: $total\n")
        sb.append("• Đã gửi thành công lên POS: $sent\n")
        sb.append("• Đang chờ gửi / Thử lại: $pending\n")
        sb.append("• Đang trong tiến trình gửi: $sending\n")
        sb.append("• Cần kiểm tra nguồn sàn: $unclassified\n")

        val recentCursor = db.query(
            TABLE_ORDERS,
            null,
            null,
            null,
            null,
            null,
            "$COLUMN_ID DESC",
            "5"
        )
        sb.append("\n📋 5 ĐƠN GẦN NHẤT:\n")
        var hasRows = false
        recentCursor.use { c ->
            while (c.moveToNext()) {
                hasRows = true
                val id = c.getLong(c.getColumnIndexOrThrow(COLUMN_ID))
                val platform = c.getString(c.getColumnIndexOrThrow(COLUMN_PLATFORM))
                val status = c.getString(c.getColumnIndexOrThrow(COLUMN_STATUS))
                val retries = c.getInt(c.getColumnIndexOrThrow(COLUMN_RETRY_COUNT))
                val createdAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_CREATED_AT))
                val lastErr = c.getString(c.getColumnIndexOrThrow(COLUMN_LAST_ERROR))

                val statusIcon = when (status) {
                    STATUS_SENT -> "🟢 THÀNH CÔNG"
                    STATUS_SENDING -> "🟡 ĐANG GỬI"
                    STATUS_UNCLASSIFIED -> "🔴 CHƯA RÕ SÀN"
                    else -> "⏳ CHỜ RETRY (Thử lại: $retries)"
                }
                sb.append("#$id [${platform.uppercase()}] $statusIcon lúc ${timeFmt.format(Date(createdAt))}")
                if (!lastErr.isNullOrEmpty()) {
                    sb.append(" (Lỗi: $lastErr)")
                }
                sb.append("\n")
            }
        }
        if (!hasRows) {
            sb.append("(Chưa có đơn hàng nào trong hàng đợi)\n")
        }

        return sb.toString().trimEnd()
    }
}
