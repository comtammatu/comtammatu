package com.comtammatu.relay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.i("BootCompletedReceiver", "Auto-starting VirtualWifiPrinterService after boot")
            val prefs = context.getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
            val url = prefs.getString("backend_url", "http://localhost:3000") ?: "http://localhost:3000"
            val branchId = prefs.getInt("branch_id", 1)
            val secret = prefs.getString("secret", "") ?: ""
            val port = prefs.getInt("port", 9100)

            val serviceIntent = Intent(context, VirtualWifiPrinterService::class.java).apply {
                action = VirtualWifiPrinterService.ACTION_START
                putExtra(VirtualWifiPrinterService.EXTRA_BACKEND_URL, url)
                putExtra(VirtualWifiPrinterService.EXTRA_BRANCH_ID, branchId)
                putExtra(VirtualWifiPrinterService.EXTRA_SECRET, secret)
                putExtra(VirtualWifiPrinterService.EXTRA_PORT, port)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
