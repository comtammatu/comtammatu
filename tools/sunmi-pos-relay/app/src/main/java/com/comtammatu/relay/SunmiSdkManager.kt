package com.comtammatu.relay

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import com.sunmi.peripheral.printer.InnerResultCallback
import com.sunmi.peripheral.printer.SunmiPrinterService

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
    private var isBound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            try {
                sunmiPrinterService = SunmiPrinterService.Stub.asInterface(service)
                isBound = true
                Log.i(TAG, "Successfully connected to SunmiPrinterService AIDL")
            } catch (e: Exception) {
                Log.e(TAG, "Failed casting SunmiPrinterService: ${e.message}", e)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            sunmiPrinterService = null
            isBound = false
            Log.w(TAG, "Disconnected from SunmiPrinterService")
        }
    }

    fun bindService() {
        if (isBound) return
        val intent = Intent().apply {
            setPackage(SERVICE_PACKAGE)
            action = SERVICE_ACTION
        }
        try {
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            Log.e(TAG, "bindService error: ${e.message}")
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
            Log.e(TAG, "Cannot print: SunmiPrinterService is not connected")
            callback?.invoke(false, "Printer service not bound")
            return
        }

        try {
            service.sendRAWData(bytes, object : InnerResultCallback.Stub() {
                override fun onRunResult(isSuccess: Boolean, code: Int, msg: String?) {
                    Log.d(TAG, "sendRAWData result: isSuccess=$isSuccess, code=$code, msg=$msg")
                    callback?.invoke(isSuccess, msg)
                }

                override fun onReturnString(result: String?) {}
                override fun onRaiseException(code: Int, msg: String?) {
                    Log.e(TAG, "sendRAWData exception: code=$code, msg=$msg")
                    callback?.invoke(false, msg)
                }
                override fun onPrintResult(code: Int, msg: String?) {}
            })
        } catch (e: Exception) {
            Log.e(TAG, "sendRAWData IPC error: ${e.message}", e)
            callback?.invoke(false, e.message)
        }
    }
}
