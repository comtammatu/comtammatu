package com.comtammatu.relay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var etBackendUrl: EditText
    private lateinit var etBranchId: EditText
    private lateinit var etSecret: EditText
    private lateinit var etPort: EditText
    private lateinit var btnToggle: Button
    private lateinit var tvStatus: TextView

    private var isServiceRunning = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Simple programmatic UI for terminal configuration without external XML layout
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }

        val tvTitle = TextView(this).apply {
            text = "CƠM TẤM MÁ TƯ — POS BRIDGE"
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, 24)
        }
        layout.addView(tvTitle)

        etBackendUrl = EditText(this).apply {
            hint = "Địa chỉ máy chủ POS (ví dụ: https://pos.comtammatu.vn)"
            setText(getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).getString("backend_url", "http://10.0.2.2:3000"))
        }
        layout.addView(etBackendUrl)

        etBranchId = EditText(this).apply {
            hint = "Mã Chi Nhánh (ví dụ: 1)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).getInt("branch_id", 1).toString())
        }
        layout.addView(etBranchId)

        etSecret = EditText(this).apply {
            hint = "Mã bí mật Relay Secret (SHOPEE_RELAY_SECRET)"
            setText(getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).getString("secret", ""))
        }
        layout.addView(etSecret)

        etPort = EditText(this).apply {
            hint = "Cổng máy in WiFi (Mặc định: 9100)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).getInt("port", 9100).toString())
        }
        layout.addView(etPort)

        btnToggle = Button(this).apply {
            text = "BẮT ĐẦU DỊCH VỤ MÁY IN"
            setOnClickListener { toggleService() }
        }
        layout.addView(btnToggle)

        tvStatus = TextView(this).apply {
            text = "Trạng thái: Chưa chạy"
            setPadding(0, 24, 0, 0)
        }
        layout.addView(tvStatus)

        setContentView(layout)
    }

    private fun toggleService() {
        val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
        val url = etBackendUrl.text.toString().trim()
        val branchId = etBranchId.text.toString().toIntOrNull() ?: 1
        val secret = etSecret.text.toString().trim()
        val port = etPort.text.toString().toIntOrNull() ?: 9100

        prefs.edit()
            .putString("backend_url", url)
            .putInt("branch_id", branchId)
            .putString("secret", secret)
            .putInt("port", port)
            .apply()

        val intent = Intent(this, VirtualWifiPrinterService::class.java).apply {
            putExtra(VirtualWifiPrinterService.EXTRA_BACKEND_URL, url)
            putExtra(VirtualWifiPrinterService.EXTRA_BRANCH_ID, branchId)
            putExtra(VirtualWifiPrinterService.EXTRA_SECRET, secret)
            putExtra(VirtualWifiPrinterService.EXTRA_PORT, port)
        }

        if (!isServiceRunning) {
            intent.action = VirtualWifiPrinterService.ACTION_START
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            isServiceRunning = true
            btnToggle.text = "DỪNG DỊCH VỤ"
            tvStatus.text = "🟢 Đang trực in cổng TCP $port (Shopee Partner: 127.0.0.1:$port)"
            Toast.makeText(this, "Đã khởi chạy dịch vụ máy in WiFi ảo!", Toast.LENGTH_SHORT).show()
        } else {
            intent.action = VirtualWifiPrinterService.ACTION_STOP
            startService(intent)
            isServiceRunning = false
            btnToggle.text = "BẮT ĐẦU DỊCH VỤ MÁY IN"
            tvStatus.text = "Trạng thái: Đã dừng"
        }
    }
}
