package com.comtammatu.relay

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Base64

/**
 * SQLite Database Helper for offline print receipt queueing and retrying.
 * Guarantees zero order loss during network blips.
 */
class OrderQueueDbHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        const val DATABASE_NAME = "sunmi_relay_queue.db"
        const val DATABASE_VERSION = 1

        const val TABLE_ORDERS = "queued_orders"
        const val COLUMN_ID = "id"
        const val COLUMN_RAW_BASE64 = "raw_base64"
        const val COLUMN_BRANCH_ID = "branch_id"
        const val COLUMN_PLATFORM = "platform"
        const val COLUMN_STATUS = "status" // PENDING, SENT, FAILED
        const val COLUMN_RETRY_COUNT = "retry_count"
        const val COLUMN_CREATED_AT = "created_at"
        const val COLUMN_LAST_ERROR = "last_error"

        const val STATUS_PENDING = "PENDING"
        const val STATUS_SENT = "SENT"
        const val STATUS_FAILED = "FAILED"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE $TABLE_ORDERS (
                $COLUMN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_RAW_BASE64 TEXT NOT NULL,
                $COLUMN_BRANCH_ID INTEGER NOT NULL,
                $COLUMN_PLATFORM TEXT NOT NULL,
                $COLUMN_STATUS TEXT NOT NULL,
                $COLUMN_RETRY_COUNT INTEGER DEFAULT 0,
                $COLUMN_CREATED_AT INTEGER NOT NULL,
                $COLUMN_LAST_ERROR TEXT
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_ORDERS")
        onCreate(db)
    }

    fun enqueueOrder(rawBytes: ByteArray, branchId: Int, platform: String = "shopee"): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_RAW_BASE64, Base64.encodeToString(rawBytes, Base64.NO_WRAP))
            put(COLUMN_BRANCH_ID, branchId)
            put(COLUMN_PLATFORM, platform)
            put(COLUMN_STATUS, STATUS_PENDING)
            put(COLUMN_RETRY_COUNT, 0)
            put(COLUMN_CREATED_AT, System.currentTimeMillis())
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

    fun markOrderFailed(orderId: Long, retryCount: Int, errorMessage: String?) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_STATUS, if (retryCount >= 10) STATUS_FAILED else STATUS_PENDING)
            put(COLUMN_RETRY_COUNT, retryCount)
            put(COLUMN_LAST_ERROR, errorMessage)
        }
        db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
    }

    data class QueuedOrder(
        val id: Long,
        val rawBase64: String,
        val branchId: Int,
        val platform: String,
        val retryCount: Int,
        val createdAt: Long
    )

    fun getPendingOrders(limit: Int = 20): List<QueuedOrder> {
        val list = mutableListOf<QueuedOrder>()
        val db = readableDatabase
        val cursor = db.query(
            TABLE_ORDERS,
            null,
            "$COLUMN_STATUS = ?",
            arrayOf(STATUS_PENDING),
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
                val retryCount = c.getInt(c.getColumnIndexOrThrow(COLUMN_RETRY_COUNT))
                val createdAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_CREATED_AT))

                list.add(QueuedOrder(id, raw, branchId, platform, retryCount, createdAt))
            }
        }
        return list
    }

    fun getPendingCount(): Int {
        val db = readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_ORDERS WHERE $COLUMN_STATUS = ?", arrayOf(STATUS_PENDING))
        return cursor.use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
    }
}
