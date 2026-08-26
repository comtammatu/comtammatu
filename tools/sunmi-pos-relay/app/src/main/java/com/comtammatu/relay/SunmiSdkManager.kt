package com.comtammatu.relay

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import com.sunmi.peripheral.printer.InnerResultCallback
import com.sunmi.peripheral.printer.SunmiPrinterService
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Manages connection and raw ESC/POS command dispatch to SUNMI built-in thermal printer.
 * Interacts with SunmiPrinterService via official SUNMI AIDL interface (com.sunmi.peripheral.printer).
 */
class SunmiSdkManager(private val context: Context) {

    companion object {
        private const val TAG = "SunmiSdkManager"
        private const val SERVICE_PACKAGE = "com.sunmi.peripheral.printer"
        private const val SERVICE_ACTION = "com.sunmi.peripheral.printer.SunmiPrinterService"
    }

    private var sunmiPrinterService: SunmiPrinterService? = null
    var isBound = false
        private set

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            try {
                sunmiPrinterService = SunmiPrinterService.Stub.asInterface(service)
                isBound = true
                Log.i(TAG, "Successfully connected to SunmiPrinterService AIDL")
                AppLogger.print("Đã kết nối thành công dịch vụ máy in phần cứng SUNMI AIDL")
            } catch (e: Exception) {
                Log.e(TAG, "Failed casting SunmiPrinterService: ${e.message}", e)
                AppLogger.e("IN ẤN", "Lỗi khởi tạo AIDL: ${e.message}")
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            sunmiPrinterService = null
            isBound = false
            Log.w(TAG, "Disconnected from SunmiPrinterService")
            AppLogger.w("IN ẤN", "Mất kết nối với dịch vụ máy in SUNMI")
        }
    }

    fun bindService() {
        if (isBound) return
        val intent = Intent().apply {
            setPackage(SERVICE_PACKAGE)
            action = SERVICE_ACTION
        }
        try {
            val bound = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
            if (!bound) {
                Log.w(TAG, "bindService returned false (Device may not have SUNMI peripheral service)")
                AppLogger.w("IN ẤN", "Không tìm thấy dịch vụ máy in SUNMI (Máy không phải SUNMI POS?)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "bindService error: ${e.message}")
            AppLogger.e("IN ẤN", "Lỗi gọi bindService: ${e.message}")
        }
    }

    fun unbindService() {
        if (!isBound) return
        try {
            context.unbindService(connection)
            isBound = false
            sunmiPrinterService = null
        } catch (e: Exception) {
            Log.e(TAG, "unbindService error: ${e.message}")
        }
    }

    /**
     * Sends raw ESC/POS bytes directly to SUNMI built-in thermal print head.
     */
    fun sendRawBytes(bytes: ByteArray, callback: ((Boolean, String?) -> Unit)? = null) {
        val service = sunmiPrinterService
        if (service == null) {
            val msg = "Không thể in: Chưa kết nối máy in tích hợp SUNMI"
            Log.e(TAG, msg)
            AppLogger.e("IN ẤN", msg)
            callback?.invoke(false, msg)
            return
        }

        try {
            service.sendRAWData(bytes, object : InnerResultCallback.Stub() {
                override fun onRunResult(isSuccess: Boolean, code: Int, msg: String?) {
                    Log.d(TAG, "sendRAWData result: isSuccess=$isSuccess, code=$code, msg=$msg")
                    if (isSuccess) {
                        AppLogger.print("Đã in xong ${bytes.size} bytes ra đầu in nhiệt SUNMI")
                    } else {
                        AppLogger.e("IN ẤN", "Đầu in báo lỗi (Code: $code, Msg: $msg)")
                    }
                    callback?.invoke(isSuccess, msg)
                }

                override fun onReturnString(result: String?) {}
                override fun onRaiseException(code: Int, msg: String?) {
                    Log.e(TAG, "sendRAWData exception: code=$code, msg=$msg")
                    AppLogger.e("IN ẤN", "Ngoại lệ đầu in: $msg (Code: $code)")
                    callback?.invoke(false, msg)
                }
                override fun onPrintResult(code: Int, msg: String?) {}
            })
        } catch (e: Exception) {
            Log.e(TAG, "sendRAWData IPC error: ${e.message}", e)
            AppLogger.e("IN ẤN", "Lỗi giao tiếp IPC máy in: ${e.message}")
            callback?.invoke(false, e.message)
        }
    }

    /**
     * Prints a test receipt to verify built-in printer hardware.
     */
    fun printTestReceipt(callback: ((Boolean, String?) -> Unit)? = null) {
        val timeStr = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())
        val out = ByteArrayOutputStream()

        // ESC @ (Initialize printer)
        out.write(byteArrayOf(0x1B, 0x40))

        // Center alignment
        out.write(byteArrayOf(0x1B, 0x61, 0x01))
        // Bold + Double height
        out.write(byteArrayOf(0x1D, 0x21, 0x11))
        out.write("CƠM TẤM MÁ TƯ\n".toByteArray(Charsets.UTF_8))

        // Normal text
        out.write(byteArrayOf(0x1D, 0x21, 0x00))
        out.write("PHẦN MỀM MÁ TƯ POS BRIDGE\n".toByteArray(Charsets.UTF_8))
        out.write("--------------------------------\n".toByteArray(Charsets.UTF_8))

        // Left alignment
        out.write(byteArrayOf(0x1B, 0x61, 0x00))
        out.write("Thời gian: $timeStr\n".toByteArray(Charsets.UTF_8))
        out.write("Trạng thái: Máy in hoạt động TỐT\n".toByteArray(Charsets.UTF_8))
        out.write("Cổng lắng nghe: TCP 9100\n".toByteArray(Charsets.UTF_8))
        out.write("--------------------------------\n".toByteArray(Charsets.UTF_8))

        // Center
        out.write(byteArrayOf(0x1B, 0x61, 0x01))
        out.write("*** PHIẾU IN KIỂM TRA ***\n\n\n\n".toByteArray(Charsets.UTF_8))

        // Cut paper: GS V 0 (0x1D 0x56 0x00)
        out.write(byteArrayOf(0x1D, 0x56, 0x00))

        AppLogger.print("Đang phát lệnh in phiếu kiểm tra SUNMI...")
        sendRawBytes(out.toByteArray(), callback)
    }
}
