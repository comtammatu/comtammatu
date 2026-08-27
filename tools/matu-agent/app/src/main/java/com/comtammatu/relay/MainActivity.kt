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
import java.net.InetSocketAddress
import java.net.Socket

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
    private lateinit var dbHelper: OrderQueueDbHelper
    private lateinit var dispatcher: WebhookDispatcher

    private val logListener = { _: String ->
        updateLogsView()
        refreshServiceState()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
            text = "MÁ TƯ AGENT"
            textSize = 18f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
        }
        val tvSubTitle = TextView(this).apply {
            text = "Máy in ảo ESC/POS cho ShopeeFood · GreenSM Food · beFood"
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
            hint = "Mã bí mật Delivery Relay"
            setText(saved.secret)
            textSize = 14f
            setPadding(20, 24, 20, 24)
            setBackgroundColor(Color.WHITE)
        }
        mainLayout.addView(createLabeledSection("Mã bí mật (Relay Secret):", etSecret))

        cbLanMode = CheckBox(this).apply {
            text = "Nhận lệnh in từ mạng LAN (bật khi app sàn chạy trên máy khác)"
            isChecked = saved.lanMode
            textSize = 13f
            setPadding(8, 12, 8, 16)
        }
        mainLayout.addView(cbLanMode)

        // Main Service Start/Stop Button
        btnToggle = Button(this).apply {
            text = if (PrintIntakeService.isServiceRunning) "DỪNG MÁY IN ẢO" else "BẮT ĐẦU MÁY IN ẢO"
            setBackgroundColor(if (PrintIntakeService.isServiceRunning) Color.parseColor("#E53E3E") else Color.parseColor("#2B6CB0"))
            setTextColor(Color.WHITE)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 28, 0, 28)
            setOnClickListener { toggleService() }
        }
        mainLayout.addView(btnToggle)

        tvStatus = TextView(this).apply {
            text = if (PrintIntakeService.isServiceRunning)
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
            text = "🖨️ KIỂM TRA CỔNG IN"
            textSize = 12f
            setOnClickListener { testPrintPort() }
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

        AppLogger.i("GIAO DIỆN", "Khởi động Má Tư Agent")
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

        val intent = Intent(this, PrintIntakeService::class.java).apply {
            putExtra(PrintIntakeService.EXTRA_BACKEND_URL, config.backendUrl)
            putExtra(PrintIntakeService.EXTRA_BRANCH_ID, config.branchId)
            putExtra(PrintIntakeService.EXTRA_SECRET, config.secret)
            putExtra(PrintIntakeService.EXTRA_PORT, config.port)
            putExtra(PrintIntakeService.EXTRA_LAN_MODE, config.lanMode)
        }

        if (!PrintIntakeService.isServiceRunning) {
            intent.action = PrintIntakeService.ACTION_START
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            btnToggle.isEnabled = false
            tvStatus.text = "🟡 Đang mở cổng TCP ${config.port}..."
            btnToggle.postDelayed({
                btnToggle.isEnabled = true
                refreshServiceState()
            }, 500)
        } else {
            intent.action = PrintIntakeService.ACTION_STOP
            startService(intent)
            btnToggle.postDelayed({ refreshServiceState() }, 200)
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

    private fun testPrintPort() {
        val config = saveCurrentConfig()
        activityScope.launch(Dispatchers.IO) {
            val result = runCatching {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress("127.0.0.1", config.port), 2000)
                }
            }
            runOnUiThread {
                if (result.isSuccess) {
                    Toast.makeText(this@MainActivity, "Cổng máy in ảo đang nhận kết nối.", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@MainActivity, "Không kết nối được cổng in. Xem nhật ký để biết chi tiết.", Toast.LENGTH_LONG).show()
                    AppLogger.e("KIỂM TRA CỔNG", result.exceptionOrNull()?.localizedMessage ?: "Lỗi không xác định")
                }
            }
        }
    }

    private fun refreshServiceState() {
        val port = etPort.text.toString().toIntOrNull() ?: PrintIntakeService.DEFAULT_PORT
        if (PrintIntakeService.isServiceRunning) {
            btnToggle.text = "DỪNG MÁY IN ẢO"
            btnToggle.setBackgroundColor(Color.parseColor("#E53E3E"))
            tvStatus.text = "🟢 Đang trực in cổng TCP $port"
        } else {
            btnToggle.text = "BẮT ĐẦU MÁY IN ẢO"
            btnToggle.setBackgroundColor(Color.parseColor("#2B6CB0"))
            tvStatus.text = "⚪ Máy in ảo chưa chạy"
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
            "--- Nhật ký trống ---\nNhấn 'KIỂM TRA POS' hoặc gửi lệnh in từ app sàn để xem log thời gian thực."
        } else {
            logs.joinToString("\n")
        }
        scrollLogs.post {
            scrollLogs.fullScroll(ScrollView.FOCUS_DOWN)
        }
    }
}
