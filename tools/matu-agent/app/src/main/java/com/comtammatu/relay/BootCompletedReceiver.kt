package com.comtammatu.relay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.i("BootCompletedReceiver", "Auto-starting PrintIntakeService after boot")
            val prefs = context.getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
            val url = prefs.getString("backend_url", "http://localhost:3000") ?: "http://localhost:3000"
            val branchId = prefs.getInt("branch_id", 0)
            val secret = prefs.getString("secret", "") ?: ""
            val port = prefs.getInt("port", 9100)
            val lanMode = prefs.getBoolean("lan_mode", false)

            if (!prefs.getBoolean(PrintIntakeService.KEY_AGENT_ENABLED, false)) {
                Log.i("BootCompletedReceiver", "Skipping auto-start: Agent was stopped by the operator")
                return
            }

            if (branchId <= 0) {
                Log.w("BootCompletedReceiver", "Skipping auto-start: branch is not configured")
                return
            }

            val serviceIntent = Intent(context, PrintIntakeService::class.java).apply {
                action = PrintIntakeService.ACTION_START
                putExtra(PrintIntakeService.EXTRA_BACKEND_URL, url)
                putExtra(PrintIntakeService.EXTRA_BRANCH_ID, branchId)
                putExtra(PrintIntakeService.EXTRA_SECRET, secret)
                putExtra(PrintIntakeService.EXTRA_PORT, port)
                putExtra(PrintIntakeService.EXTRA_LAN_MODE, lanMode)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
