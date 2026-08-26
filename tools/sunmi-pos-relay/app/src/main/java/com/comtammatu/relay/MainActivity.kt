package com.comtammatu.relay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class MainActivity : Activity() {

    private lateinit var etBackendUrl: EditText
    private lateinit var etBranchId: EditText
    private lateinit var etSecret: EditText
    private lateinit var etPort: EditText
    private lateinit var cbLanMode: CheckBox
    private lateinit var btnToggle: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvLogs: TextView
    private lateinit var scrollLogs: ScrollView

    private val activityScope = CoroutineScope(Dispatchers.Main + Job())
    private lateinit var sunmiSdk: SunmiSdkManager
    private lateinit var dbHelper: OrderQueueDbHelper
    private lateinit var dispatcher: WebhookDispatcher

    private val logListener = { _: String ->
        updateLogsView()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        sunmiSdk = SunmiSdkManager(this)
        sunmiSdk.bindService()
        dbHelper = OrderQueueDbHelper(this)

        val saved = configFromPrefs()
        dispatcher = WebhookDispatcher(this, saved.backendUrl, saved.branchId, saved.secret)

        // Main root vertical scroll view
        val rootScroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
            isFillViewport = true
        }

        val mainLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 36, 32, 36)
            setBackgroundColor(Color.parseColor("#F8F9FA"))
        }

        // Header Title Banner
        val headerCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 20, 24, 20)
            setBackgroundColor(Color.parseColor("#1B2A4A"))
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 24) }
            layoutParams = params
        }

        val tvTitle = TextView(this).apply {
            text = "CƠM TẤM MÁ TƯ — POS BRIDGE"
            textSize = 18f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
        }
        val tvSubTitle = TextView(this).apply {
            text = "Virtual ESC/POS Thermal Printer & Food Delivery Relay"
            textSize = 12f
            setTextColor(Color.parseColor("#A0AEC0"))
        }
        headerCard.addView(tvTitle)
        headerCard.addView(tvSubTitle)
        mainLayout.addView(headerCard)

        // Form Fields
        etBackendUrl = EditText(this).apply {
            hint = "Địa chỉ máy chủ POS (ví dụ: https://pos.comtammatu.vn)"
            setText(saved.backendUrl)
            textSize = 14f
            setPadding(20, 24, 20, 24)
            setBackgroundColor(Color.WHITE)
        }
        mainLayout.addView(createLabeledSection("Địa chỉ Máy chủ POS (Backend URL):", etBackendUrl))

        val rowIds = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }

        etBranchId = EditText(this).apply {
            hint = "Mã Chi Nhánh (1)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(saved.branchId.toString())
            textSize = 14f
            setPadding(20, 24, 20, 24)
            setBackgroundColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(0, 0, 12, 0)
            }
        }

        etPort = EditText(this).apply {
            hint = "Cổng TCP (9100)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(saved.port.toString())
            textSize = 14f
            setPadding(20, 24, 20, 24)
            setBackgroundColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(12, 0, 0, 0)
            }
        }
        rowIds.addView(etBranchId)
        rowIds.addView(etPort)
        mainLayout.addView(createLabeledSection("Chi Nhánh & Cổng Máy in:", rowIds))

        etSecret = EditText(this).apply {
            hint = "Mã bí mật Relay Secret (SHOPEE_RELAY_SECRET)"
            setText(saved.secret)
            textSize = 14f
            setPadding(20, 24, 20, 24)
            setBackgroundColor(Color.WHITE)
        }
        mainLayout.addView(createLabeledSection("Mã bí mật (Relay Secret):", etSecret))

        cbLanMode = CheckBox(this).apply {
            text = "Nhận lệnh in từ mạng LAN (Chỉ bật khi Shopee chạy trên máy khác)"
            isChecked = saved.lanMode
            textSize = 13f
            setPadding(8, 12, 8, 16)
        }
        mainLayout.addView(cbLanMode)

        // Main Service Start/Stop Button
        btnToggle = Button(this).apply {
            text = if (VirtualWifiPrinterService.isServiceRunning) "DỪNG DỊCH VỤ MÁY IN" else "BẮT ĐẦU DỊCH VỤ MÁY IN"
            setBackgroundColor(if (VirtualWifiPrinterService.isServiceRunning) Color.parseColor("#E53E3E") else Color.parseColor("#2B6CB0"))
            setTextColor(Color.WHITE)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 28, 0, 28)
            setOnClickListener { toggleService() }
        }
        mainLayout.addView(btnToggle)

        tvStatus = TextView(this).apply {
            text = if (VirtualWifiPrinterService.isServiceRunning)
                "🟢 Đang trực in cổng TCP ${saved.port}"
            else
                "⚪ Trạng thái: Chưa chạy"
            textSize = 13f
            setTextColor(Color.parseColor("#4A5568"))
            setPadding(4, 12, 4, 16)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        mainLayout.addView(tvStatus)

        // Diagnostic Buttons Row
        val btnScroll = HorizontalScrollView(this).apply {
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 8, 0, 16) }
            layoutParams = params
            isHorizontalScrollBarEnabled = false
        }

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        val btnPing = Button(this).apply {
            text = "⚡ KIỂM TRA POS"
            textSize = 12f
            setOnClickListener { testPingPos() }
        }
        val btnTestPrint = Button(this).apply {
            text = "🖨️ IN THỬ SUNMI"
            textSize = 12f
            setOnClickListener { testPrintSunmi() }
        }
        val btnQueue = Button(this).apply {
            text = "📊 XEM HÀNG ĐỢI"
            textSize = 12f
            setOnClickListener { viewQueue() }
        }
        val btnClear = Button(this).apply {
            text = "🗑️ XÓA LOG"
            textSize = 12f
            setOnClickListener { AppLogger.clear() }
        }

        btnRow.addView(btnPing)
        btnRow.addView(btnTestPrint)
        btnRow.addView(btnQueue)
        btnRow.addView(btnClear)
        btnScroll.addView(btnRow)
        mainLayout.addView(btnScroll)

        // Log Console Header
        val tvLogHeader = TextView(this).apply {
            text = "NHẬT KÝ HOẠT ĐỘNG THỜI GIAN THỰC (LIVE LOG):"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#2D3748"))
            setPadding(4, 8, 4, 8)
        }
        mainLayout.addView(tvLogHeader)

        // Log Console Box
        scrollLogs = ScrollView(this).apply {
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                550
            )
            layoutParams = params
            setBackgroundColor(Color.parseColor("#1A202C"))
            setPadding(16, 16, 16, 16)
        }

        tvLogs = TextView(this).apply {
            text = "Đang tải nhật ký..."
            textSize = 11.5f
            setTextColor(Color.parseColor("#68D391")) // Terminal Green
            typeface = Typeface.MONOSPACE
            setLineSpacing(4f, 1.1f)
        }
        scrollLogs.addView(tvLogs)
        mainLayout.addView(scrollLogs)

        rootScroll.addView(mainLayout)
        setContentView(rootScroll)

        AppLogger.i("GIAO DIỆN", "Khởi động ứng dụng Má Tư POS Bridge")
        updateLogsView()
    }

    override fun onStart() {
        super.onStart()
        AppLogger.addListener(logListener)
        updateLogsView()
    }

    override fun onStop() {
        super.onStop()
        AppLogger.removeListener(logListener)
    }

    override fun onDestroy() {
        super.onDestroy()
        sunmiSdk.unbindService()
    }

    private fun createLabeledSection(label: String, view: View): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, 0, 0, 16) }
            layoutParams = params

            val tv = TextView(this@MainActivity).apply {
                text = label
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#4A5568"))
                setPadding(0, 0, 0, 6)
            }
            addView(tv)
            addView(view)
        }
    }

    private data class SavedConfig(
        val backendUrl: String,
        val branchId: Int,
        val secret: String,
        val port: Int,
        val lanMode: Boolean
    )

    private fun configFromPrefs(): SavedConfig {
        val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
        return SavedConfig(
            backendUrl = prefs.getString("backend_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000",
            branchId = prefs.getInt("branch_id", 1),
            secret = prefs.getString("secret", "") ?: "",
            port = prefs.getInt("port", 9100),
            lanMode = prefs.getBoolean("lan_mode", false)
        )
    }

    private fun saveCurrentConfig(): SavedConfig {
        val url = etBackendUrl.text.toString().trim()
        val branchId = etBranchId.text.toString().toIntOrNull() ?: 1
        val secret = etSecret.text.toString().trim()
        val port = etPort.text.toString().toIntOrNull() ?: 9100
        val lanMode = cbLanMode.isChecked

        getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).edit()
            .putString("backend_url", url)
            .putInt("branch_id", branchId)
            .putString("secret", secret)
            .putInt("port", port)
            .putBoolean("lan_mode", lanMode)
            .apply()

        dispatcher.updateConfig(url, branchId, secret)
        return SavedConfig(url, branchId, secret, port, lanMode)
    }

    private fun toggleService() {
        val config = saveCurrentConfig()

        val intent = Intent(this, VirtualWifiPrinterService::class.java).apply {
            putExtra(VirtualWifiPrinterService.EXTRA_BACKEND_URL, config.backendUrl)
            putExtra(VirtualWifiPrinterService.EXTRA_BRANCH_ID, config.branchId)
            putExtra(VirtualWifiPrinterService.EXTRA_SECRET, config.secret)
            putExtra(VirtualWifiPrinterService.EXTRA_PORT, config.port)
            putExtra(VirtualWifiPrinterService.EXTRA_LAN_MODE, config.lanMode)
        }

        if (!VirtualWifiPrinterService.isServiceRunning) {
            intent.action = VirtualWifiPrinterService.ACTION_START
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            btnToggle.text = "DỪNG DỊCH VỤ MÁY IN"
            btnToggle.setBackgroundColor(Color.parseColor("#E53E3E"))
            val listenHost = if (config.lanMode) "IP LAN của máy" else "127.0.0.1"
            tvStatus.text = "🟢 Đang trực in cổng TCP ${config.port} (Shopee: $listenHost:${config.port})"
            Toast.makeText(this, "Đã khởi chạy dịch vụ máy in WiFi ảo!", Toast.LENGTH_SHORT).show()
        } else {
            intent.action = VirtualWifiPrinterService.ACTION_STOP
            startService(intent)
            btnToggle.text = "BẮT ĐẦU DỊCH VỤ MÁY IN"
            btnToggle.setBackgroundColor(Color.parseColor("#2B6CB0"))
            tvStatus.text = "⚪ Trạng thái: Đã dừng"
            Toast.makeText(this, "Đã dừng dịch vụ máy in!", Toast.LENGTH_SHORT).show()
        }
    }

    private fun testPingPos() {
        val config = saveCurrentConfig()
        activityScope.launch {
            Toast.makeText(this@MainActivity, "Đang kiểm tra kết nối POS...", Toast.LENGTH_SHORT).show()
            val result = dispatcher.pingPosServer(config.backendUrl, config.secret, config.branchId)
            if (result.isSuccess) {
                Toast.makeText(this@MainActivity, "Kết nối POS thành công!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this@MainActivity, "Kết nối thất bại! Xem chi tiết trong log", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun testPrintSunmi() {
        sunmiSdk.printTestReceipt { isSuccess, msg ->
            runOnUiThread {
                if (isSuccess) {
                    Toast.makeText(this, "In thử thành công!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Lỗi in: $msg", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun viewQueue() {
        val summary = dbHelper.getQueueSummary()
        AppLogger.i("HÀNG ĐỢI", "\n$summary")
        Toast.makeText(this, "Đã cập nhật trạng thái hàng đợi trong Log", Toast.LENGTH_SHORT).show()
    }

    private fun updateLogsView() {
        val logs = AppLogger.getAllLogs()
        tvLogs.text = if (logs.isEmpty()) {
            "--- Nhật ký trống ---\nNhấn 'KIỂM TRA POS' hoặc phát lệnh in từ Shopee để xem log thời gian thực."
        } else {
            logs.joinToString("\n")
        }
        scrollLogs.post {
            scrollLogs.fullScroll(ScrollView.FOCUS_DOWN)
        }
    }
}
