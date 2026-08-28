package com.comtammatu.relay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.text.method.PasswordTransformationMethod
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.math.roundToInt

class MainActivity : Activity() {

    private lateinit var etBackendUrl: EditText
    private lateinit var etBranchId: EditText
    private lateinit var etSecret: EditText
    private lateinit var etPort: EditText
    private lateinit var cbLanMode: CheckBox
    private lateinit var btnToggle: Button
    private lateinit var tvStatusTitle: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvStatusBadge: TextView
    private lateinit var tvEndpoint: TextView
    private lateinit var statusDot: View
    private lateinit var tvLogs: TextView
    private lateinit var scrollLogs: ScrollView

    private val activityScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var dbHelper: OrderQueueDbHelper
    private lateinit var dispatcher: WebhookDispatcher

    private val logListener = { _: String ->
        updateLogsView()
        refreshServiceState()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = color(R.color.surface)
        window.navigationBarColor = color(R.color.surface)
        setLightStatusBar()

        dbHelper = OrderQueueDbHelper(this)

        val saved = configFromPrefs()
        dispatcher = WebhookDispatcher(this, saved.backendUrl, saved.branchId, saved.secret)

        val rootScroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setBackgroundColor(color(R.color.canvas))
        }

        val mainLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(32))
        }

        mainLayout.addView(createAppHeader())
        mainLayout.addView(space(20))
        mainLayout.addView(createServicePanel(saved))
        mainLayout.addView(space(24))
        mainLayout.addView(createConfigurationSection(saved))
        mainLayout.addView(space(24))
        mainLayout.addView(createDiagnosticsSection())
        mainLayout.addView(space(24))
        mainLayout.addView(createLogSection())

        rootScroll.addView(mainLayout)
        setContentView(rootScroll)

        AppLogger.i("GIAO DIỆN", "Khởi động Má Tư Agent")
        updateLogsView()
        refreshServiceState()
    }

    override fun onStart() {
        super.onStart()
        AppLogger.addListener(logListener)
        updateLogsView()
        refreshServiceState()
    }

    override fun onStop() {
        super.onStop()
        AppLogger.removeListener(logListener)
    }

    override fun onDestroy() {
        activityScope.cancel()
        dbHelper.close()
        super.onDestroy()
    }

    private fun createAppHeader(): View {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val monogram = TextView(this).apply {
            text = getString(R.string.brand_monogram)
            textSize = 14f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            background = roundedBackground(color(R.color.primary), color(R.color.primary), 12)
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
        }

        val titleGroup = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleGroup.addView(TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 20f
            setTextColor(color(R.color.ink))
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        })
        titleGroup.addView(TextView(this).apply {
            text = getString(R.string.brand_subtitle)
            textSize = 13f
            setTextColor(color(R.color.ink_muted))
            setPadding(0, dp(2), 0, 0)
        })

        header.addView(monogram)
        header.addView(titleGroup)
        return header
    }

    private fun createServicePanel(saved: SavedConfig): View {
        val panel = panel()

        val statusRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        statusDot = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(10), dp(10)).apply {
                marginEnd = dp(10)
            }
        }
        tvStatusTitle = TextView(this).apply {
            textSize = 16f
            setTextColor(color(R.color.ink))
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        tvStatusBadge = TextView(this).apply {
            textSize = 12f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(6), dp(10), dp(6))
        }

        statusRow.addView(statusDot)
        statusRow.addView(tvStatusTitle)
        statusRow.addView(tvStatusBadge)

        tvStatus = TextView(this).apply {
            textSize = 13f
            setTextColor(color(R.color.ink_muted))
            setPadding(0, dp(10), 0, 0)
            setLineSpacing(dp(2).toFloat(), 1f)
        }

        tvEndpoint = TextView(this).apply {
            text = endpointSummary(saved.port, saved.branchId, saved.lanMode)
            textSize = 12.5f
            setTextColor(color(R.color.ink_secondary))
            typeface = Typeface.MONOSPACE
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = roundedBackground(
                color(R.color.surface_muted),
                color(R.color.border),
                10
            )
        }

        btnToggle = Button(this).apply {
            isAllCaps = false
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minHeight = dp(52)
            setPadding(dp(18), dp(12), dp(18), dp(12))
            setOnClickListener { toggleService() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        panel.addView(statusRow)
        panel.addView(tvStatus)
        panel.addView(space(14))
        panel.addView(tvEndpoint)
        panel.addView(space(16))
        panel.addView(btnToggle)
        return panel
    }

    private fun createConfigurationSection(saved: SavedConfig): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.configuration_title),
            getString(R.string.configuration_description)
        ))
        section.addView(space(10))

        val panel = panel()

        etBackendUrl = editText(
            hint = "https://pos.comtammatu.vn",
            value = saved.backendUrl,
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        )
        panel.addView(field(getString(R.string.backend_url_label), etBackendUrl))
        panel.addView(space(16))

        val branchAndPort = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }
        etBranchId = editText(
            hint = "1",
            value = saved.branchId.toString(),
            inputType = InputType.TYPE_CLASS_NUMBER
        )
        etPort = editText(
            hint = "9100",
            value = saved.port.toString(),
            inputType = InputType.TYPE_CLASS_NUMBER
        )
        val branchField = field(getString(R.string.branch_id_label), etBranchId).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            }
        }
        val portField = field(getString(R.string.tcp_port_label), etPort).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(6)
            }
        }
        branchAndPort.addView(branchField)
        branchAndPort.addView(portField)
        panel.addView(branchAndPort)
        panel.addView(space(16))

        etSecret = editText(
            hint = getString(R.string.relay_secret_hint),
            value = saved.secret,
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        ).apply {
            transformationMethod = PasswordTransformationMethod.getInstance()
        }
        panel.addView(field(getString(R.string.relay_secret_label), etSecret))
        panel.addView(space(16))

        cbLanMode = CheckBox(this).apply {
            text = getString(R.string.lan_mode_label)
            isChecked = saved.lanMode
            textSize = 14f
            setTextColor(color(R.color.ink))
            minHeight = dp(52)
            setPadding(dp(10), dp(8), dp(10), dp(8))
            buttonTintList = ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
                intArrayOf(color(R.color.primary), color(R.color.ink_muted))
            )
            background = roundedBackground(
                color(R.color.surface_muted),
                color(R.color.border),
                10
            )
        }
        panel.addView(cbLanMode)
        panel.addView(TextView(this).apply {
            text = getString(R.string.lan_mode_description)
            textSize = 12f
            setTextColor(color(R.color.ink_muted))
            setPadding(dp(12), dp(8), dp(8), 0)
        })

        section.addView(panel)
        return section
    }

    private fun createDiagnosticsSection(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.diagnostics_title),
            getString(R.string.diagnostics_description)
        ))
        section.addView(space(10))

        val panel = panel()
        val firstRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }
        firstRow.addView(secondaryButton(getString(R.string.check_pos_action)) { testPingPos() }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            }
        })
        firstRow.addView(secondaryButton(getString(R.string.check_print_port_action)) { testPrintPort() }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(6)
            }
        })

        val queueButton = secondaryButton(getString(R.string.view_queue_action)) { viewQueue() }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        panel.addView(firstRow)
        panel.addView(space(12))
        panel.addView(queueButton)
        section.addView(panel)
        return section
    }

    private fun createLogSection(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val headingRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val heading = sectionHeading(
            getString(R.string.logs_title),
            getString(R.string.logs_description)
        ).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val clearButton = secondaryButton(getString(R.string.clear_logs_action)) { AppLogger.clear() }.apply {
            minHeight = dp(48)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(12) }
        }
        headingRow.addView(heading)
        headingRow.addView(clearButton)
        section.addView(headingRow)
        section.addView(space(10))

        scrollLogs = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(320)
            )
            isFillViewport = true
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = roundedBackground(
                color(R.color.console),
                color(R.color.console_border),
                14
            )
        }

        tvLogs = TextView(this).apply {
            text = getString(R.string.logs_loading)
            textSize = 12f
            setTextColor(color(R.color.console_text))
            typeface = Typeface.MONOSPACE
            setLineSpacing(dp(4).toFloat(), 1.08f)
            setTextIsSelectable(true)
        }
        scrollLogs.addView(tvLogs)
        section.addView(scrollLogs)
        return section
    }

    private fun sectionHeading(title: String, description: String): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = title
                textSize = 16f
                setTextColor(color(R.color.ink))
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            })
            addView(TextView(this@MainActivity).apply {
                text = description
                textSize = 12.5f
                setTextColor(color(R.color.ink_muted))
                setPadding(0, dp(3), 0, 0)
            })
        }
    }

    private fun panel(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = roundedBackground(color(R.color.surface), color(R.color.border), 16)
        }
    }

    private fun field(label: String, input: View): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = label
                textSize = 12.5f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setTextColor(color(R.color.ink_secondary))
                setPadding(dp(2), 0, dp(2), dp(7))
            })
            addView(input)
        }
    }

    private fun editText(hint: String, value: String, inputType: Int): EditText {
        return EditText(this).apply {
            this.hint = hint
            setText(value)
            this.inputType = inputType
            textSize = 14f
            setTextColor(color(R.color.ink))
            setHintTextColor(color(R.color.ink_muted))
            setSingleLine(true)
            minHeight = dp(52)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = fieldBackground()
        }
    }

    private fun secondaryButton(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 13f
            minHeight = dp(52)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setTextColor(color(R.color.ink))
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            background = buttonBackground(
                normal = color(R.color.surface),
                pressed = color(R.color.surface_muted),
                stroke = color(R.color.input_border)
            )
            setOnClickListener { onClick() }
        }
    }

    private fun stylePrimaryButton(button: Button, destructive: Boolean) {
        val normal = color(if (destructive) R.color.destructive else R.color.primary)
        val pressed = color(if (destructive) R.color.destructive_pressed else R.color.primary_pressed)
        button.setTextColor(ColorStateList(
            arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
            intArrayOf(color(R.color.ink_muted), Color.WHITE)
        ))
        button.background = buttonBackground(normal, pressed, normal)
    }

    private fun buttonBackground(normal: Int, pressed: Int, stroke: Int): StateListDrawable {
        return StateListDrawable().apply {
            addState(
                intArrayOf(-android.R.attr.state_enabled),
                roundedBackground(
                    color(R.color.neutral_surface),
                    color(R.color.neutral_border),
                    10
                )
            )
            addState(
                intArrayOf(android.R.attr.state_pressed),
                roundedBackground(pressed, stroke, 10)
            )
            addState(intArrayOf(), roundedBackground(normal, stroke, 10))
        }
    }

    private fun fieldBackground(): StateListDrawable {
        return StateListDrawable().apply {
            addState(
                intArrayOf(android.R.attr.state_focused),
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    setColor(color(R.color.surface))
                    setStroke(dp(2), color(R.color.primary))
                    cornerRadius = dp(10).toFloat()
                }
            )
            addState(
                intArrayOf(),
                roundedBackground(color(R.color.surface), color(R.color.input_border), 10)
            )
        }
    }

    private fun roundedBackground(fillColor: Int, strokeColor: Int, radius: Int): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fillColor)
            setStroke(dp(1), strokeColor)
            cornerRadius = dp(radius).toFloat()
        }
    }

    private fun circleBackground(fillColor: Int): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(fillColor)
        }
    }

    private fun space(height: Int): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dp(height))
        }
    }

    private fun endpointSummary(port: Int, branchId: Int, lanMode: Boolean): String {
        val host = if (lanMode) "0.0.0.0" else "127.0.0.1"
        return "$host:$port  ·  Chi nhánh $branchId"
    }

    private fun color(resourceId: Int): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getColor(resourceId)
        } else {
            @Suppress("DEPRECATION")
            resources.getColor(resourceId)
        }
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).roundToInt()
    }

    @Suppress("DEPRECATION")
    private fun setLightStatusBar() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            btnToggle.isEnabled = false
            tvStatusTitle.text = getString(R.string.service_starting_title)
            tvStatus.text = getString(R.string.service_starting_description, config.port)
            tvStatusBadge.text = getString(R.string.status_processing)
            tvStatusBadge.setTextColor(color(R.color.warning_text))
            tvStatusBadge.background = roundedBackground(
                color(R.color.warning_surface),
                color(R.color.warning_border),
                50
            )
            statusDot.background = circleBackground(color(R.color.warning))
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
            Toast.makeText(this@MainActivity, "Đang kiểm tra kết nối POS…", Toast.LENGTH_SHORT).show()
            val result = dispatcher.pingPosServer(config.backendUrl, config.secret, config.branchId)
            if (result.isSuccess) {
                Toast.makeText(this@MainActivity, "Đã kết nối POS", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this@MainActivity, "Không thể kết nối POS. Xem nhật ký để biết chi tiết.", Toast.LENGTH_LONG).show()
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
                    Toast.makeText(this@MainActivity, "Cổng máy in ảo đang nhận kết nối", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@MainActivity, "Không thể kết nối cổng in. Xem nhật ký để biết chi tiết.", Toast.LENGTH_LONG).show()
                    AppLogger.e("KIỂM TRA CỔNG", result.exceptionOrNull()?.localizedMessage ?: "Lỗi không xác định")
                }
            }
        }
    }

    private fun refreshServiceState() {
        val port = etPort.text.toString().toIntOrNull() ?: PrintIntakeService.DEFAULT_PORT
        val branchId = etBranchId.text.toString().toIntOrNull() ?: 1
        val lanMode = cbLanMode.isChecked
        tvEndpoint.text = endpointSummary(port, branchId, lanMode)

        if (PrintIntakeService.isServiceRunning) {
            btnToggle.text = getString(R.string.stop_service_action)
            stylePrimaryButton(btnToggle, destructive = true)
            tvStatusTitle.text = getString(R.string.service_running_title)
            tvStatus.text = getString(R.string.service_running_description)
            tvStatusBadge.text = getString(R.string.status_running)
            tvStatusBadge.setTextColor(color(R.color.success_text))
            tvStatusBadge.background = roundedBackground(
                color(R.color.success_surface),
                color(R.color.success_border),
                50
            )
            statusDot.background = circleBackground(color(R.color.success))
        } else {
            btnToggle.text = getString(R.string.start_service_action)
            stylePrimaryButton(btnToggle, destructive = false)
            tvStatusTitle.text = getString(R.string.service_stopped_title)
            tvStatus.text = getString(R.string.service_stopped_description)
            tvStatusBadge.text = getString(R.string.status_stopped)
            tvStatusBadge.setTextColor(color(R.color.neutral_text))
            tvStatusBadge.background = roundedBackground(
                color(R.color.neutral_surface),
                color(R.color.neutral_border),
                50
            )
            statusDot.background = circleBackground(color(R.color.ink_muted))
        }
    }

    private fun viewQueue() {
        val summary = dbHelper.getQueueSummary()
        AppLogger.i("HÀNG ĐỢI", "\n$summary")
        Toast.makeText(this, "Đã cập nhật trạng thái hàng đợi trong nhật ký", Toast.LENGTH_SHORT).show()
    }

    private fun updateLogsView() {
        val logs = AppLogger.getAllLogs()
        tvLogs.text = if (logs.isEmpty()) {
            "--- Nhật ký trống ---\nKiểm tra POS hoặc gửi lệnh in để xem sự kiện tại đây."
        } else {
            logs.joinToString("\n")
        }
        scrollLogs.post {
            scrollLogs.fullScroll(ScrollView.FOCUS_DOWN)
        }
    }
}
