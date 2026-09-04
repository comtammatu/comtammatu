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
        const val DATABASE_VERSION = 7

        const val TABLE_ORDERS = "queued_orders"
        const val COLUMN_ID = "id"
        const val COLUMN_RAW_BASE64 = "raw_base64"
        const val COLUMN_RECEIPT_TEXT = "receipt_text"
        const val COLUMN_BRANCH_ID = "branch_id"
        const val COLUMN_PLATFORM = "platform"
        const val COLUMN_STATUS = "status" // PENDING, SENDING, BLOCKED, SENT, UNCLASSIFIED, DISMISSED
        const val COLUMN_RETRY_COUNT = "retry_count"
        const val COLUMN_CREATED_AT = "created_at"
        const val COLUMN_LAST_ERROR = "last_error"
        const val COLUMN_NEXT_RETRY_AT = "next_retry_at"
        const val COLUMN_CLAIMED_AT = "claimed_at"
        const val COLUMN_REMOTE_RESPONSE = "remote_response"
        const val COLUMN_SOURCE_ORDER_REF = "source_order_ref"
        const val COLUMN_RECEIPT_FINGERPRINT = "receipt_fingerprint"
        const val COLUMN_POS_ORDER_ID = "pos_order_id"
        const val COLUMN_POS_ORDER_NUMBER = "pos_order_number"
        const val COLUMN_POS_DISPLAY_ID = "pos_display_id"
        const val COLUMN_SENT_AT = "sent_at"
        const val COLUMN_DUPLICATE_COUNT = "duplicate_count"
        const val COLUMN_LAST_SEEN_AT = "last_seen_at"
        const val COLUMN_IDEMPOTENT = "idempotent"
        const val COLUMN_RESOLVED_AT = "resolved_at"
        const val COLUMN_RESOLUTION_NOTE = "resolution_note"

        const val STATUS_PENDING = "PENDING"
        const val STATUS_SENDING = "SENDING"
        const val STATUS_BLOCKED = "BLOCKED"
        const val STATUS_SENT = "SENT"
        const val STATUS_UNCLASSIFIED = "UNCLASSIFIED"
        const val STATUS_DISMISSED = "DISMISSED"

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
                $COLUMN_CLAIMED_AT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_REMOTE_RESPONSE TEXT,
                $COLUMN_SOURCE_ORDER_REF TEXT,
                $COLUMN_RECEIPT_FINGERPRINT TEXT,
                $COLUMN_POS_ORDER_ID INTEGER,
                $COLUMN_POS_ORDER_NUMBER TEXT,
                $COLUMN_POS_DISPLAY_ID TEXT,
                $COLUMN_SENT_AT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_DUPLICATE_COUNT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_LAST_SEEN_AT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_IDEMPOTENT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_RESOLVED_AT INTEGER NOT NULL DEFAULT 0,
                $COLUMN_RESOLUTION_NOTE TEXT
            )
            """.trimIndent()
        )
        createIdentityIndexes(db)
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
        if (oldVersion < 5) {
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_REMOTE_RESPONSE TEXT")
        }
        if (oldVersion < 6) {
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_SOURCE_ORDER_REF TEXT")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_RECEIPT_FINGERPRINT TEXT")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_POS_ORDER_ID INTEGER")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_POS_ORDER_NUMBER TEXT")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_POS_DISPLAY_ID TEXT")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_SENT_AT INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_DUPLICATE_COUNT INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_LAST_SEEN_AT INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_IDEMPOTENT INTEGER NOT NULL DEFAULT 0")
            migrateOrderIdentities(db)
            migrateSentMappings(db)
            collapseLegacyDuplicates(db)
            createIdentityIndexes(db)
        }
        if (oldVersion < 7) {
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_RESOLVED_AT INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_ORDERS ADD COLUMN $COLUMN_RESOLUTION_NOTE TEXT")
        }
    }

    private fun createIdentityIndexes(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_queued_orders_source_identity
            ON $TABLE_ORDERS ($COLUMN_BRANCH_ID, $COLUMN_PLATFORM, $COLUMN_SOURCE_ORDER_REF)
            WHERE $COLUMN_SOURCE_ORDER_REF IS NOT NULL AND $COLUMN_SOURCE_ORDER_REF <> ''
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_queued_orders_payload_identity
            ON $TABLE_ORDERS ($COLUMN_BRANCH_ID, $COLUMN_PLATFORM, $COLUMN_RECEIPT_FINGERPRINT)
            WHERE $COLUMN_RECEIPT_FINGERPRINT IS NOT NULL AND $COLUMN_RECEIPT_FINGERPRINT <> ''
            """.trimIndent()
        )
    }

    private fun migrateSentMappings(db: SQLiteDatabase) {
        val cursor = db.query(
            TABLE_ORDERS,
            arrayOf(COLUMN_ID, COLUMN_REMOTE_RESPONSE, COLUMN_RECEIPT_TEXT, COLUMN_CREATED_AT),
            "$COLUMN_STATUS = ?",
            arrayOf(STATUS_SENT),
            null,
            null,
            null
        )
        cursor.use { rows ->
            while (rows.moveToNext()) {
                val orderId = rows.getLong(rows.getColumnIndexOrThrow(COLUMN_ID))
                val mapping = RelayResponseParser.parse(
                    rows.getString(rows.getColumnIndexOrThrow(COLUMN_REMOTE_RESPONSE))
                )
                val receiptText = rows.getString(rows.getColumnIndexOrThrow(COLUMN_RECEIPT_TEXT))
                val createdAt = rows.getLong(rows.getColumnIndexOrThrow(COLUMN_CREATED_AT))
                val values = sentMappingValues(mapping, createdAt).apply {
                    put(COLUMN_SOURCE_ORDER_REF, OrderIdentity.extractSourceOrderRef(receiptText))
                    put(COLUMN_RAW_BASE64, "")
                    putNull(COLUMN_RECEIPT_TEXT)
                    putNull(COLUMN_REMOTE_RESPONSE)
                }
                db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
            }
        }
    }

    private fun migrateOrderIdentities(db: SQLiteDatabase) {
        val cursor = db.query(
            TABLE_ORDERS,
            arrayOf(COLUMN_ID, COLUMN_RAW_BASE64, COLUMN_RECEIPT_TEXT),
            null,
            null,
            null,
            null,
            null
        )
        cursor.use { rows ->
            while (rows.moveToNext()) {
                val orderId = rows.getLong(rows.getColumnIndexOrThrow(COLUMN_ID))
                val rawBase64 = rows.getString(rows.getColumnIndexOrThrow(COLUMN_RAW_BASE64))
                val receiptText = rows.getString(rows.getColumnIndexOrThrow(COLUMN_RECEIPT_TEXT))
                val fingerprint = try {
                    OrderIdentity.fingerprint(Base64.decode(rawBase64, Base64.DEFAULT))
                } catch (_: Exception) {
                    null
                }
                val values = ContentValues().apply {
                    put(COLUMN_SOURCE_ORDER_REF, OrderIdentity.extractSourceOrderRef(receiptText))
                    put(COLUMN_RECEIPT_FINGERPRINT, fingerprint)
                }
                db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
            }
        }
    }

    private fun collapseLegacyDuplicates(db: SQLiteDatabase) {
        val cursor = db.query(
            TABLE_ORDERS,
            arrayOf(
                COLUMN_ID,
                COLUMN_BRANCH_ID,
                COLUMN_PLATFORM,
                COLUMN_SOURCE_ORDER_REF,
                COLUMN_RECEIPT_FINGERPRINT
            ),
            null,
            null,
            null,
            null,
            "CASE $COLUMN_STATUS WHEN '$STATUS_SENT' THEN 0 WHEN '$STATUS_SENDING' THEN 1 " +
                "WHEN '$STATUS_PENDING' THEN 2 ELSE 3 END, $COLUMN_ID ASC"
        )
        val keeperByIdentity = mutableMapOf<String, Long>()
        cursor.use { rows ->
            while (rows.moveToNext()) {
                val orderId = rows.getLong(rows.getColumnIndexOrThrow(COLUMN_ID))
                val branchId = rows.getInt(rows.getColumnIndexOrThrow(COLUMN_BRANCH_ID))
                val platform = rows.getString(rows.getColumnIndexOrThrow(COLUMN_PLATFORM))
                val sourceRef = rows.getString(rows.getColumnIndexOrThrow(COLUMN_SOURCE_ORDER_REF))
                val fingerprint = rows.getString(rows.getColumnIndexOrThrow(COLUMN_RECEIPT_FINGERPRINT))
                val prefix = "$branchId\u0000$platform\u0000"
                val keys = buildList {
                    sourceRef?.takeIf(String::isNotBlank)?.let { add(prefix + "source:" + it) }
                    fingerprint?.takeIf(String::isNotBlank)?.let { add(prefix + "payload:" + it) }
                }
                val keeperId = keys.firstNotNullOfOrNull(keeperByIdentity::get)
                if (keeperId == null) {
                    keys.forEach { keeperByIdentity[it] = orderId }
                } else {
                    db.delete(TABLE_ORDERS, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
                    keys.forEach { key ->
                        if (!keeperByIdentity.containsKey(key)) keeperByIdentity[key] = keeperId
                    }
                }
            }
        }
    }

    fun enqueueReceipt(
        rawBytes: ByteArray,
        branchId: Int,
        platform: String,
        receiptText: String? = null,
        status: String = STATUS_PENDING,
        lastError: String? = null
    ): EnqueueResult {
        val db = writableDatabase
        val sourceOrderRef = OrderIdentity.extractSourceOrderRef(receiptText)
        val fingerprint = OrderIdentity.fingerprint(rawBytes)
        val now = System.currentTimeMillis()
        db.beginTransaction()
        try {
            val existing = findExistingOrder(db, branchId, platform, sourceOrderRef, fingerprint)
            if (existing != null) {
                val duplicateValues = ContentValues().apply {
                    put(COLUMN_DUPLICATE_COUNT, existing.duplicateCount + 1)
                    put(COLUMN_LAST_SEEN_AT, now)
                }
                db.update(
                    TABLE_ORDERS,
                    duplicateValues,
                    "$COLUMN_ID = ?",
                    arrayOf(existing.id.toString())
                )
                db.setTransactionSuccessful()
                return EnqueueResult(existing.id, inserted = false, existing.status, sourceOrderRef)
            }

            val values = ContentValues().apply {
                put(COLUMN_RAW_BASE64, Base64.encodeToString(rawBytes, Base64.NO_WRAP))
                put(COLUMN_RECEIPT_TEXT, receiptText)
                put(COLUMN_BRANCH_ID, branchId)
                put(COLUMN_PLATFORM, platform)
                put(COLUMN_STATUS, status)
                put(COLUMN_RETRY_COUNT, 0)
                put(COLUMN_CREATED_AT, now)
                put(COLUMN_LAST_ERROR, lastError)
                put(COLUMN_SOURCE_ORDER_REF, sourceOrderRef)
                put(COLUMN_RECEIPT_FINGERPRINT, fingerprint)
                put(COLUMN_LAST_SEEN_AT, now)
            }
            val orderId = db.insertOrThrow(TABLE_ORDERS, null, values)
            db.setTransactionSuccessful()
            return EnqueueResult(orderId, inserted = true, status, sourceOrderRef)
        } finally {
            db.endTransaction()
        }
    }

    fun markOrderSent(orderId: Long, remoteResponse: String? = null) {
        val db = writableDatabase
        val mapping = RelayResponseParser.parse(remoteResponse)
        val values = sentMappingValues(mapping, System.currentTimeMillis()).apply {
            put(COLUMN_STATUS, STATUS_SENT)
            if (mapping.orderId == null && mapping.orderNumber == null) {
                put(COLUMN_REMOTE_RESPONSE, remoteResponse?.take(2 * 1024))
            } else {
                putNull(COLUMN_REMOTE_RESPONSE)
            }
            putNull(COLUMN_LAST_ERROR)
        }
        db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
    }

    private fun sentMappingValues(mapping: PosOrderMapping, sentAt: Long): ContentValues =
        ContentValues().apply {
            mapping.orderId?.let { put(COLUMN_POS_ORDER_ID, it) }
            mapping.orderNumber?.let { put(COLUMN_POS_ORDER_NUMBER, it) }
            mapping.displayId?.let { put(COLUMN_POS_DISPLAY_ID, it) }
            put(COLUMN_SENT_AT, sentAt)
            put(COLUMN_IDEMPOTENT, if (mapping.idempotent) 1 else 0)
        }

    private data class ExistingOrder(
        val id: Long,
        val status: String,
        val duplicateCount: Int
    )

    private fun findExistingOrder(
        db: SQLiteDatabase,
        branchId: Int,
        platform: String,
        sourceOrderRef: String?,
        fingerprint: String,
        excludingOrderId: Long? = null
    ): ExistingOrder? {
        val identityClause = if (sourceOrderRef == null) {
            "$COLUMN_RECEIPT_FINGERPRINT = ?"
        } else {
            "($COLUMN_SOURCE_ORDER_REF = ? OR $COLUMN_RECEIPT_FINGERPRINT = ?)"
        }
        val args = mutableListOf(branchId.toString(), platform)
        if (sourceOrderRef != null) args.add(sourceOrderRef)
        args.add(fingerprint)
        val exclusion = if (excludingOrderId == null) "" else " AND $COLUMN_ID <> ?"
        if (excludingOrderId != null) args.add(excludingOrderId.toString())
        val cursor = db.query(
            TABLE_ORDERS,
            arrayOf(COLUMN_ID, COLUMN_STATUS, COLUMN_DUPLICATE_COUNT),
            "$COLUMN_BRANCH_ID = ? AND $COLUMN_PLATFORM = ? AND $identityClause$exclusion",
            args.toTypedArray(),
            null,
            null,
            "$COLUMN_ID DESC",
            "1"
        )
        return cursor.use { row ->
            if (!row.moveToFirst()) return@use null
            ExistingOrder(
                id = row.getLong(row.getColumnIndexOrThrow(COLUMN_ID)),
                status = row.getString(row.getColumnIndexOrThrow(COLUMN_STATUS)),
                duplicateCount = row.getInt(row.getColumnIndexOrThrow(COLUMN_DUPLICATE_COUNT))
            )
        }
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

    fun markOrderBlocked(orderId: Long, errorMessage: String?) {
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_BLOCKED)
            put(COLUMN_LAST_ERROR, errorMessage)
            put(COLUMN_NEXT_RETRY_AT, 0)
            put(COLUMN_CLAIMED_AT, 0)
        }
        writableDatabase.update(
            TABLE_ORDERS,
            values,
            "$COLUMN_ID = ?",
            arrayOf(orderId.toString())
        )
    }

    data class EnqueueResult(
        val orderId: Long,
        val inserted: Boolean,
        val status: String,
        val sourceOrderRef: String?
    )

    data class QueuedOrder(
        val id: Long,
        val rawBase64: String,
        val branchId: Int,
        val platform: String,
        val receiptText: String?,
        val retryCount: Int,
        val createdAt: Long,
        val status: String,
        val lastError: String?,
        val nextRetryAt: Long,
        val remoteResponse: String?,
        val sourceOrderRef: String?,
        val posOrderId: Long?,
        val posOrderNumber: String?,
        val posDisplayId: String?,
        val sentAt: Long,
        val duplicateCount: Int,
        val lastSeenAt: Long,
        val idempotent: Boolean,
        val resolvedAt: Long,
        val resolutionNote: String?
    )

    private fun readQueuedOrder(c: android.database.Cursor): QueuedOrder = QueuedOrder(
        id = c.getLong(c.getColumnIndexOrThrow(COLUMN_ID)),
        rawBase64 = c.getString(c.getColumnIndexOrThrow(COLUMN_RAW_BASE64)),
        branchId = c.getInt(c.getColumnIndexOrThrow(COLUMN_BRANCH_ID)),
        platform = c.getString(c.getColumnIndexOrThrow(COLUMN_PLATFORM)),
        receiptText = c.getString(c.getColumnIndexOrThrow(COLUMN_RECEIPT_TEXT)),
        retryCount = c.getInt(c.getColumnIndexOrThrow(COLUMN_RETRY_COUNT)),
        createdAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_CREATED_AT)),
        status = c.getString(c.getColumnIndexOrThrow(COLUMN_STATUS)),
        lastError = c.getString(c.getColumnIndexOrThrow(COLUMN_LAST_ERROR)),
        nextRetryAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_NEXT_RETRY_AT)),
        remoteResponse = c.getString(c.getColumnIndexOrThrow(COLUMN_REMOTE_RESPONSE)),
        sourceOrderRef = c.getString(c.getColumnIndexOrThrow(COLUMN_SOURCE_ORDER_REF)),
        posOrderId = c.getColumnIndexOrThrow(COLUMN_POS_ORDER_ID).let { index ->
            if (c.isNull(index)) null else c.getLong(index)
        },
        posOrderNumber = c.getString(c.getColumnIndexOrThrow(COLUMN_POS_ORDER_NUMBER)),
        posDisplayId = c.getString(c.getColumnIndexOrThrow(COLUMN_POS_DISPLAY_ID)),
        sentAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_SENT_AT)),
        duplicateCount = c.getInt(c.getColumnIndexOrThrow(COLUMN_DUPLICATE_COUNT)),
        lastSeenAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_LAST_SEEN_AT)),
        idempotent = c.getInt(c.getColumnIndexOrThrow(COLUMN_IDEMPOTENT)) == 1,
        resolvedAt = c.getLong(c.getColumnIndexOrThrow(COLUMN_RESOLVED_AT)),
        resolutionNote = c.getString(c.getColumnIndexOrThrow(COLUMN_RESOLUTION_NOTE))
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
                list.add(readQueuedOrder(c))
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
            "($COLUMN_STATUS = ? OR $COLUMN_STATUS = ?) AND $COLUMN_RECEIPT_TEXT IS NULL AND $COLUMN_RAW_BASE64 <> ''",
            arrayOf(STATUS_UNCLASSIFIED, STATUS_PENDING),
            null,
            null,
            "$COLUMN_CREATED_AT ASC",
            limit.toString()
        )

        cursor.use { c ->
            while (c.moveToNext()) {
                list.add(
                    readQueuedOrder(c)
                )
            }
        }
        return list
    }

    fun reclassifyOrder(orderId: Long, platform: String, receiptText: String?): Boolean {
        val values = ContentValues().apply {
            put(COLUMN_PLATFORM, platform)
            if (receiptText != null) {
                put(COLUMN_RECEIPT_TEXT, receiptText)
                put(COLUMN_SOURCE_ORDER_REF, OrderIdentity.extractSourceOrderRef(receiptText))
            }
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

    fun getWaitingCount(): Int = countByStatuses(QueueLifecycle.waitingStatuses)

    fun getResolvedCount(): Int = countByStatuses(QueueLifecycle.resolvedStatuses)

    private fun countByStatuses(statuses: List<String>): Int {
        val placeholders = statuses.joinToString(",") { "?" }
        val cursor = readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_ORDERS WHERE $COLUMN_STATUS IN ($placeholders)",
            statuses.toTypedArray()
        )
        return cursor.use { if (it.moveToFirst()) it.getInt(0) else 0 }
    }

    fun getOrders(resolved: Boolean, limit: Int = 100): List<QueuedOrder> {
        val statuses = if (resolved) QueueLifecycle.resolvedStatuses else QueueLifecycle.waitingStatuses
        val placeholders = statuses.joinToString(",") { "?" }
        val cursor = readableDatabase.query(
            TABLE_ORDERS,
            null,
            "$COLUMN_STATUS IN ($placeholders)",
            statuses.toTypedArray(),
            null,
            null,
            "$COLUMN_CREATED_AT DESC",
            limit.toString()
        )
        return cursor.use { c ->
            buildList {
                while (c.moveToNext()) add(readQueuedOrder(c))
            }
        }
    }

    fun retryOrderNow(orderId: Long): Boolean {
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_PENDING)
            put(COLUMN_NEXT_RETRY_AT, 0)
            put(COLUMN_CLAIMED_AT, 0)
            putNull(COLUMN_LAST_ERROR)
        }
        return writableDatabase.update(
            TABLE_ORDERS,
            values,
            "$COLUMN_ID = ? AND $COLUMN_STATUS IN (?, ?)",
            arrayOf(orderId.toString(), STATUS_PENDING, STATUS_BLOCKED)
        ) > 0
    }

    /**
     * Removes a manually handled receipt from the active queue while retaining
     * its source identity so a later reprint is still rejected as a duplicate.
     */
    fun dismissWaitingOrder(orderId: Long, resolutionNote: String): Boolean {
        val dismissibleStatuses = QueueLifecycle.dismissibleStatuses
        val placeholders = dismissibleStatuses.joinToString(",") { "?" }
        val values = ContentValues().apply {
            put(COLUMN_STATUS, STATUS_DISMISSED)
            put(COLUMN_RESOLVED_AT, System.currentTimeMillis())
            put(COLUMN_RESOLUTION_NOTE, resolutionNote.take(500))
            put(COLUMN_NEXT_RETRY_AT, 0)
            put(COLUMN_CLAIMED_AT, 0)
            putNull(COLUMN_LAST_ERROR)
        }
        return writableDatabase.update(
            TABLE_ORDERS,
            values,
            "$COLUMN_ID = ? AND $COLUMN_STATUS IN ($placeholders)",
            (listOf(orderId.toString()) + dismissibleStatuses).toTypedArray()
        ) > 0
    }

    /** Removes diagnostic payloads while preserving deduplication and POS mappings. */
    fun compactResolvedOrders(): Int {
        val db = writableDatabase
        val cursor = db.query(
            TABLE_ORDERS,
            arrayOf(COLUMN_ID, COLUMN_STATUS, COLUMN_REMOTE_RESPONSE),
            "$COLUMN_STATUS IN (?, ?) AND ($COLUMN_RAW_BASE64 <> '' OR $COLUMN_RECEIPT_TEXT IS NOT NULL OR $COLUMN_REMOTE_RESPONSE IS NOT NULL)",
            QueueLifecycle.resolvedStatuses.toTypedArray(),
            null,
            null,
            null
        )
        val rows = cursor.use { result ->
            buildList {
                while (result.moveToNext()) {
                    add(Triple(
                        result.getLong(result.getColumnIndexOrThrow(COLUMN_ID)),
                        result.getString(result.getColumnIndexOrThrow(COLUMN_STATUS)),
                        result.getString(result.getColumnIndexOrThrow(COLUMN_REMOTE_RESPONSE))
                    ))
                }
            }
        }
        db.beginTransaction()
        try {
            for ((orderId, status, remoteResponse) in rows) {
                val values = if (status == STATUS_SENT) {
                    sentMappingValues(RelayResponseParser.parse(remoteResponse), System.currentTimeMillis())
                } else {
                    ContentValues()
                }.apply {
                    put(COLUMN_RAW_BASE64, "")
                    putNull(COLUMN_RECEIPT_TEXT)
                    putNull(COLUMN_REMOTE_RESPONSE)
                }
                db.update(TABLE_ORDERS, values, "$COLUMN_ID = ?", arrayOf(orderId.toString()))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return rows.size
    }

    fun getQueueSummary(): String {
        val db = readableDatabase
        var pending = 0
        var sending = 0
        var sent = 0
        var dismissed = 0
        var unclassified = 0
        var blocked = 0
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
                    STATUS_DISMISSED -> dismissed = count
                    STATUS_UNCLASSIFIED -> unclassified = count
                    STATUS_BLOCKED -> blocked = count
                }
            }
        }

        val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        val sb = StringBuilder()
        sb.append("📊 SỔ ĐỐI CHIẾU ĐƠN TRÊN MÁY:\n")
        sb.append("• Tổng số đơn đã nhận: $total\n")
        sb.append("• Đã xuất lên POS: $sent\n")
        sb.append("• Thu ngân đã nhập tay: $dismissed\n")
        sb.append("• Đang chờ gửi / Thử lại: $pending\n")
        sb.append("• Đang trong tiến trình gửi: $sending\n")
        sb.append("• Cần kiểm tra nguồn sàn: $unclassified\n")
        sb.append("• Cần xử lý thủ công: $blocked\n")

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
                    STATUS_DISMISSED -> "⚪ ĐÃ NHẬP TAY"
                    STATUS_SENDING -> "🟡 ĐANG GỬI"
                    STATUS_UNCLASSIFIED -> "🔴 CHƯA RÕ SÀN"
                    STATUS_BLOCKED -> "🔴 CẦN XỬ LÝ"
                    else -> "⏳ CHỜ RETRY (Thử lại: $retries)"
                }
                sb.append("#$id [${platform.uppercase()}] $statusIcon lúc ${timeFmt.format(Date(createdAt))}")
                OperatorErrorFormatter.format(lastErr)?.let { operatorError ->
                    sb.append(" (Lỗi: $operatorError)")
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
