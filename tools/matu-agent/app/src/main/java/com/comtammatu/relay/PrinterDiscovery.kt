package com.comtammatu.relay

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

/** Advertises the raw ESC/POS endpoint to delivery apps that support DNS-SD. */
class PrinterDiscovery(context: Context) {
    companion object {
        const val SERVICE_NAME = "Má Tư Agent"
        const val SERVICE_TYPE = "_pdl-datastream._tcp."
        private const val TAG = "PrinterDiscovery"
    }

    private val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var listener: NsdManager.RegistrationListener? = null

    fun register(port: Int) {
        if (listener != null) return
        val registrationListener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                AppLogger.s("TỰ NHẬN MÁY IN", "Đã công bố ${serviceInfo.serviceName} trên mạng nội bộ")
            }

            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                listener = null
                Log.w(TAG, "Printer discovery registration failed: $errorCode")
                AppLogger.w("TỰ NHẬN MÁY IN", "Không thể công bố máy in tự động (mã $errorCode)")
            }

            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) = Unit

            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "Printer discovery unregistration failed: $errorCode")
            }
        }
        listener = registrationListener
        manager.registerService(
            NsdServiceInfo().apply {
                serviceName = SERVICE_NAME
                serviceType = SERVICE_TYPE
                setPort(port)
            },
            NsdManager.PROTOCOL_DNS_SD,
            registrationListener
        )
    }

    fun unregister() {
        val activeListener = listener ?: return
        listener = null
        runCatching { manager.unregisterService(activeListener) }
            .onFailure { Log.w(TAG, "Could not unregister printer discovery", it) }
    }
}
