package com.comtammatu.sunmicompat

import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.os.Binder
import android.os.IBinder
import android.os.Parcel
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class SunmiPrinterCompatService : Service() {
    private data class ClientSession(
        val buffer: SunmiPrintBuffer = SunmiPrintBuffer(MAX_PAYLOAD_BYTES),
        var scheduledFlush: ScheduledFuture<*>? = null
    )

    private val binder = PrinterBinder()
    private val sessions = ConcurrentHashMap<Int, ClientSession>()
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private lateinit var relay: LoopbackPrintRelay

    override fun onCreate() {
        super.onCreate()
        relay = LoopbackPrintRelay(this)
        relay.start()
    }

    override fun onBind(intent: Intent?): IBinder? =
        if (intent?.action == SunmiLegacyContract.SERVICE_ACTION) binder else null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onDestroy() {
        sessions.keys.forEach(::flushSession)
        scheduler.shutdownNow()
        relay.close()
        super.onDestroy()
    }

    private inner class PrinterBinder : Binder() {
        override fun onTransact(code: Int, data: Parcel, reply: Parcel?, flags: Int): Boolean {
            if (code == INTERFACE_TRANSACTION) {
                reply?.writeString(SunmiLegacyContract.SERVICE_DESCRIPTOR)
                return true
            }
            if (code !in SunmiLegacyContract.TRANSACTION_UPDATE_FIRMWARE..SunmiLegacyContract.TRANSACTION_LABEL_OUTPUT) {
                return super.onTransact(code, data, reply, flags)
            }

            val response = reply ?: return false
            data.enforceInterface(SunmiLegacyContract.SERVICE_DESCRIPTOR)
            val callerUid = getCallingUid()
            return when (code) {
                SunmiLegacyContract.TRANSACTION_UPDATE_FIRMWARE -> complete(response)
                SunmiLegacyContract.TRANSACTION_GET_FIRMWARE_STATUS -> result(response, 0xC3)
                SunmiLegacyContract.TRANSACTION_GET_SERVICE_VERSION -> result(response, SERVICE_VERSION)
                SunmiLegacyContract.TRANSACTION_PRINTER_INIT -> {
                    notifyRunResult(data.readStrongBinder(), true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINTER_SELF_CHECKING -> {
                    notifyRunResult(data.readStrongBinder(), true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_SERIAL_NO -> result(response, PRINTER_SERIAL)
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_VERSION -> result(response, PRINTER_VERSION)
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_MODAL -> result(response, PRINTER_MODEL)
                SunmiLegacyContract.TRANSACTION_GET_PRINTED_LENGTH -> {
                    notifyReturnString(data.readStrongBinder(), "0")
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_LINE_WRAP -> {
                    val lines = data.readInt()
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, session(callerUid).buffer.lineWrap(lines))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_SEND_RAW_DATA -> {
                    val bytes = data.createByteArray() ?: ByteArray(0)
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, session(callerUid).buffer.appendRaw(bytes))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_SET_ALIGNMENT -> {
                    val alignment = data.readInt().coerceIn(0, 2)
                    val callback = data.readStrongBinder()
                    val accepted = session(callerUid).buffer.appendRaw(
                        byteArrayOf(0x1B, 0x61, alignment.toByte())
                    )
                    acknowledgeWrite(callerUid, callback, accepted)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_SET_FONT_NAME -> {
                    data.readString()
                    notifyRunResult(data.readStrongBinder(), true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_SET_FONT_SIZE -> {
                    data.readFloat()
                    notifyRunResult(data.readStrongBinder(), true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_TEXT -> {
                    val text = data.readString().orEmpty()
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, session(callerUid).buffer.appendText(text))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_TEXT_WITH_FONT -> {
                    val text = data.readString().orEmpty()
                    data.readString()
                    data.readFloat()
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, session(callerUid).buffer.appendText(text))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_COLUMNS_TEXT,
                SunmiLegacyContract.TRANSACTION_PRINT_COLUMNS_STRING -> {
                    val columns = data.createStringArray().orEmpty()
                    val widths = data.createIntArray() ?: IntArray(0)
                    data.createIntArray()
                    val callback = data.readStrongBinder()
                    val accepted = session(callerUid).buffer.appendColumns(columns, widths)
                    acknowledgeWrite(callerUid, callback, accepted)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_BITMAP -> {
                    val bitmap = readBitmap(data)
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, appendBitmap(callerUid, bitmap))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_BAR_CODE -> {
                    val value = data.readString().orEmpty()
                    repeat(4) { data.readInt() }
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, appendVisibleCode(callerUid, value))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_QR_CODE -> {
                    val value = data.readString().orEmpty()
                    repeat(2) { data.readInt() }
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, appendVisibleCode(callerUid, value))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_PRINT_ORIGINAL_TEXT -> {
                    val text = data.readString().orEmpty()
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, session(callerUid).buffer.appendText(text))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_COMMIT_PRINT -> {
                    Log.w(TAG, "PrinterX requested the standard batch transaction on the legacy service")
                    scheduleFlush(callerUid)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_COMMIT_BUFFER -> {
                    session(callerUid).buffer.markCommittedLine()
                    scheduleFlush(callerUid)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_ENTER_BUFFER -> {
                    if (data.readInt() != 0) session(callerUid).buffer.clear()
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_EXIT_BUFFER -> {
                    val commit = data.readInt() != 0
                    if (commit) scheduleFlush(callerUid)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_TAX -> complete(response)
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_FACTORY -> {
                    notifyReturnString(data.readStrongBinder(), PRINTER_MODEL)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_CLEAR_BUFFER -> {
                    session(callerUid).buffer.clear()
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_COMMIT_BUFFER_WITH_CALLBACK -> {
                    val callback = data.readStrongBinder()
                    session(callerUid).buffer.markCommittedLine()
                    scheduleFlush(callerUid)
                    notifyPrintResult(callback, 0, "OK")
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_EXIT_BUFFER_WITH_CALLBACK -> {
                    val commit = data.readInt() != 0
                    val callback = data.readStrongBinder()
                    if (commit) scheduleFlush(callerUid)
                    notifyPrintResult(callback, 0, "OK")
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_UPDATE_PRINTER_STATE -> result(response, 1)
                SunmiLegacyContract.TRANSACTION_CUT_PAPER -> {
                    val callback = data.readStrongBinder()
                    flushSoon(callerUid)
                    notifyRunResult(callback, true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_GET_CUT_PAPER_TIMES -> result(response, 0)
                SunmiLegacyContract.TRANSACTION_OPEN_DRAWER -> {
                    notifyRunResult(data.readStrongBinder(), true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_GET_OPEN_DRAWER_TIMES -> result(response, 0)
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_MODE,
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_BBM_DISTANCE,
                SunmiLegacyContract.TRANSACTION_GET_FORCED_DOUBLE,
                SunmiLegacyContract.TRANSACTION_GET_FORCED_ROW_HEIGHT,
                SunmiLegacyContract.TRANSACTION_GET_FONT_NAME,
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_DENSITY -> result(response, 0)
                SunmiLegacyContract.TRANSACTION_PRINT_BITMAP_CUSTOM -> {
                    val bitmap = readBitmap(data)
                    data.readInt()
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, appendBitmap(callerUid, bitmap))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_IS_FORCED_ANTI_WHITE,
                SunmiLegacyContract.TRANSACTION_IS_FORCED_BOLD,
                SunmiLegacyContract.TRANSACTION_IS_FORCED_UNDERLINE,
                SunmiLegacyContract.TRANSACTION_GET_DRAWER_STATUS -> result(response, false)
                SunmiLegacyContract.TRANSACTION_GET_PRINTER_PAPER -> result(response, 1)
                SunmiLegacyContract.TRANSACTION_PRINT_2D_CODE -> {
                    val value = data.readString().orEmpty()
                    repeat(3) { data.readInt() }
                    val callback = data.readStrongBinder()
                    acknowledgeWrite(callerUid, callback, appendVisibleCode(callerUid, value))
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_AUTO_OUT_PAPER -> {
                    val callback = data.readStrongBinder()
                    flushSoon(callerUid)
                    notifyRunResult(callback, true)
                    complete(response)
                }
                SunmiLegacyContract.TRANSACTION_SEND_LCD_COMMAND,
                SunmiLegacyContract.TRANSACTION_SEND_LCD_STRING,
                SunmiLegacyContract.TRANSACTION_SEND_LCD_BITMAP,
                SunmiLegacyContract.TRANSACTION_SEND_LCD_DOUBLE_STRING,
                SunmiLegacyContract.TRANSACTION_SEND_LCD_FILL_STRING,
                SunmiLegacyContract.TRANSACTION_SEND_LCD_MULTI_STRING,
                SunmiLegacyContract.TRANSACTION_SET_PRINTER_STYLE,
                SunmiLegacyContract.TRANSACTION_LABEL_LOCATE,
                SunmiLegacyContract.TRANSACTION_LABEL_OUTPUT -> complete(response)
                else -> super.onTransact(code, data, reply, flags)
            }
        }
    }

    private fun session(uid: Int): ClientSession = sessions.getOrPut(uid) { ClientSession() }

    private fun acknowledgeWrite(uid: Int, callback: IBinder?, accepted: Boolean) {
        if (accepted) {
            scheduleFlush(uid)
            notifyRunResult(callback, true)
        } else {
            notifyError(callback, ERROR_BUFFER_FULL, "Print job exceeds the Má Tư Agent limit")
        }
    }

    private fun appendVisibleCode(uid: Int, value: String): Boolean =
        session(uid).buffer.appendText("$value\n")

    private fun appendBitmap(uid: Int, bitmap: Bitmap?): Boolean {
        if (bitmap == null || bitmap.width <= 0 || bitmap.height <= 0) return false
        if (bitmap.width.toLong() * bitmap.height > MAX_BITMAP_PIXELS) return false
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        return session(uid).buffer.appendRaw(
            EscPosRasterEncoder.encode(bitmap.width, bitmap.height, pixels)
        )
    }

    private fun scheduleFlush(uid: Int) {
        val client = session(uid)
        synchronized(client) {
            client.scheduledFlush?.cancel(false)
            client.scheduledFlush = scheduler.schedule(
                { flushSession(uid) },
                JOB_IDLE_TIMEOUT_MS,
                TimeUnit.MILLISECONDS
            )
        }
    }

    private fun flushSoon(uid: Int) {
        val client = session(uid)
        synchronized(client) {
            client.scheduledFlush?.cancel(false)
            client.scheduledFlush = scheduler.schedule(
                { flushSession(uid) },
                0,
                TimeUnit.MILLISECONDS
            )
        }
    }

    private fun flushSession(uid: Int) {
        val client = sessions[uid] ?: return
        val rawReceipt = synchronized(client) {
            client.scheduledFlush = null
            client.buffer.drainReceipt(includeCut = false)
        } ?: return
        val payload = rawReceipt + byteArrayOf(0x1D, 0x56, 0x41, 0x00)
        if (!relay.enqueue(payload)) {
            client.buffer.prependRaw(rawReceipt)
            scheduleFlush(uid)
        }
    }

    private fun readBitmap(data: Parcel): Bitmap? =
        if (data.readInt() == 0) null else Bitmap.CREATOR.createFromParcel(data)

    private fun complete(reply: Parcel): Boolean {
        reply.writeNoException()
        return true
    }

    private fun result(reply: Parcel, value: Int): Boolean {
        reply.writeNoException()
        reply.writeInt(value)
        return true
    }

    private fun result(reply: Parcel, value: Boolean): Boolean = result(reply, if (value) 1 else 0)

    private fun result(reply: Parcel, value: String): Boolean {
        reply.writeNoException()
        reply.writeString(value)
        return true
    }

    private fun notifyRunResult(callback: IBinder?, success: Boolean) {
        transactCallback(callback, SunmiLegacyContract.CALLBACK_ON_RUN_RESULT) { parcel ->
            parcel.writeInt(if (success) 1 else 0)
        }
    }

    private fun notifyReturnString(callback: IBinder?, value: String) {
        transactCallback(callback, SunmiLegacyContract.CALLBACK_ON_RETURN_STRING) { parcel ->
            parcel.writeString(value)
        }
    }

    private fun notifyError(callback: IBinder?, code: Int, message: String) {
        transactCallback(callback, SunmiLegacyContract.CALLBACK_ON_RAISE_EXCEPTION) { parcel ->
            parcel.writeInt(code)
            parcel.writeString(message)
        }
    }

    private fun notifyPrintResult(callback: IBinder?, code: Int, message: String) {
        transactCallback(callback, SunmiLegacyContract.CALLBACK_ON_PRINT_RESULT) { parcel ->
            parcel.writeInt(code)
            parcel.writeString(message)
        }
    }

    private fun transactCallback(callback: IBinder?, code: Int, write: (Parcel) -> Unit) {
        if (callback == null) return
        val parcel = Parcel.obtain()
        try {
            parcel.writeInterfaceToken(SunmiLegacyContract.CALLBACK_DESCRIPTOR)
            write(parcel)
            callback.transact(code, parcel, null, IBinder.FLAG_ONEWAY)
        } catch (error: Exception) {
            Log.w(TAG, "Printer callback failed", error)
        } finally {
            parcel.recycle()
        }
    }

    companion object {
        private const val TAG = "MatuSunmiService"
        private const val SERVICE_VERSION = "4.14.0"
        private const val PRINTER_SERIAL = "MATU-AGENT"
        private const val PRINTER_VERSION = "1.3.0"
        private const val PRINTER_MODEL = "Má Tư Agent"
        private const val ERROR_BUFFER_FULL = 1001
        private const val MAX_PAYLOAD_BYTES = 256 * 1024
        private const val MAX_BITMAP_PIXELS = 4_000_000L
        private const val JOB_IDLE_TIMEOUT_MS = 1_500L
    }
}
