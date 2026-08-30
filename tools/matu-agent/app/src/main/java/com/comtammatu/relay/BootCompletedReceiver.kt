package com.comtammatu.relay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val supportedActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED
        )
        if (intent.action !in supportedActions) return

        val prefs = context.getSharedPreferences(
            PrintIntakeService.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val url = prefs.getString(
            PrintIntakeService.KEY_BACKEND_URL,
            PrintIntakeService.DEFAULT_BACKEND_URL
        ) ?: PrintIntakeService.DEFAULT_BACKEND_URL
        val branchId = prefs.getInt(
            PrintIntakeService.KEY_BRANCH_ID,
            PrintIntakeService.DEFAULT_BRANCH_ID
        )
        val secret = prefs.getString(PrintIntakeService.KEY_SECRET, "") ?: ""
        val port = prefs.getInt(
            PrintIntakeService.KEY_PORT,
            PrintIntakeService.DEFAULT_PORT
        )
        val lanMode = prefs.getBoolean(PrintIntakeService.KEY_LAN_MODE, false)
        val enabled = prefs.getBoolean(PrintIntakeService.KEY_AGENT_ENABLED, false)

        if (!AgentLifecyclePolicy.shouldAutoStart(intent.action, enabled, branchId)) {
            Log.i(
                "BootCompletedReceiver",
                "Skipping auto-start after ${intent.action}: enabled=$enabled branch=$branchId"
            )
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

        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }.onSuccess {
            Log.i("BootCompletedReceiver", "Auto-started Agent after ${intent.action}")
        }.onFailure { error ->
            Log.e("BootCompletedReceiver", "Could not auto-start Agent", error)
        }
    }
}
