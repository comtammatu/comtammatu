package com.comtammatu.relay

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.method.PasswordTransformationMethod
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
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
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Collections
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

class MainActivity : Activity() {

    private lateinit var etBackendUrl: EditText
    private lateinit var etBranchId: EditText
    private lateinit var etSecret: EditText
    private lateinit var btnToggleSecret: Button
    private var isSecretVisible = false
    private lateinit var etPort: EditText
    private lateinit var cbLanMode: CheckBox
    private lateinit var cbShopeeEnabled: CheckBox
    private lateinit var cbGreenSmEnabled: CheckBox
    private lateinit var cbBeEnabled: CheckBox
    private lateinit var btnToggle: Button
    private lateinit var tvStatusTitle: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvStatusBadge: TextView
    private lateinit var tvEndpoint: TextView
    private lateinit var tvWaitingKpi: TextView
    private lateinit var tvSentKpi: TextView
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
        mainLayout.addView(createOrderManagementSection())
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

    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean {
        if (ev?.action == MotionEvent.ACTION_DOWN) {
            val v = currentFocus
            if (v is EditText) {
                val outRect = Rect()
                v.getGlobalVisibleRect(outRect)
                if (!outRect.contains(ev.rawX.toInt(), ev.rawY.toInt())) {
                    v.clearFocus()
                    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
                    imm?.hideSoftInputFromWindow(v.windowToken, 0)
                }
            }
        }
        return super.dispatchTouchEvent(ev)
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
            background = circleBackground(color(R.color.ink_muted))
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
            setPadding(dp(12), dp(6), dp(12), dp(6))
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

        val endpointContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBackground(
                color(R.color.surface_muted),
                color(R.color.border),
                10
            )
            setPadding(dp(12), dp(8), dp(8), dp(8))
        }

        tvEndpoint = TextView(this).apply {
            text = endpointSummary(saved.port, saved.branchId, saved.lanMode)
            textSize = 12.5f
            setTextColor(color(R.color.ink_secondary))
            typeface = Typeface.MONOSPACE
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val btnCopyEndpoint = secondaryButton(getString(R.string.copy_ip_action)) {
            val port = etPort.text.toString().toIntOrNull() ?: 9100
            val raw = getRawEndpoint(port, cbLanMode.isChecked)
            copyToClipboard("Endpoint", raw, getString(R.string.ip_copied_toast))
        }.apply {
            minHeight = dp(38)
            textSize = 12f
            setPadding(dp(10), dp(6), dp(10), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        endpointContainer.addView(tvEndpoint)
        endpointContainer.addView(btnCopyEndpoint)

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
        panel.addView(endpointContainer)
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
            hint = "Mã từ URL POS",
            value = if (saved.branchId > 0) saved.branchId.toString() else "",
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

        val secretRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        etSecret = editText(
            hint = getString(R.string.relay_secret_hint),
            value = saved.secret,
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        ).apply {
            transformationMethod = PasswordTransformationMethod.getInstance()
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        btnToggleSecret = secondaryButton(getString(R.string.show_secret_action)) {
            isSecretVisible = !isSecretVisible
            if (isSecretVisible) {
                etSecret.transformationMethod = null
                btnToggleSecret.text = getString(R.string.hide_secret_action)
            } else {
                etSecret.transformationMethod = PasswordTransformationMethod.getInstance()
                btnToggleSecret.text = getString(R.string.show_secret_action)
            }
            etSecret.setSelection(etSecret.text.length)
        }.apply {
            minHeight = dp(52)
            textSize = 12.5f
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(8) }
        }
        secretRow.addView(etSecret)
        secretRow.addView(btnToggleSecret)
        panel.addView(field(getString(R.string.relay_secret_label), secretRow))
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
        panel.addView(space(18))
        panel.addView(sectionHeading(
            getString(R.string.platform_configuration_title),
            getString(R.string.platform_configuration_description)
        ))
        panel.addView(space(8))

        cbShopeeEnabled = platformCard("ShopeeFood", R.color.shopee_orange, R.color.shopee_surface, R.color.shopee_border, saved.shopeeEnabled)
        cbGreenSmEnabled = platformCard("Green SM Food", R.color.greensm_green, R.color.greensm_surface, R.color.greensm_border, saved.greenSmEnabled)
        cbBeEnabled = platformCard("beFood", R.color.befood_yellow, R.color.befood_surface, R.color.befood_border, saved.beEnabled)
        panel.addView(cbShopeeEnabled)
        panel.addView(space(8))
        panel.addView(cbGreenSmEnabled)
        panel.addView(space(8))
        panel.addView(cbBeEnabled)

        section.addView(panel)
        return section
    }

    private fun createOrderManagementSection(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.orders_title),
            getString(R.string.orders_description)
        ))
        section.addView(space(10))

        val ordersPanel = panel()

        val kpiRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }

        tvWaitingKpi = TextView(this).apply {
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(color(R.color.warning_text))
            background = roundedBackground(color(R.color.warning_surface), color(R.color.warning_border), 10)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            }
        }

        tvSentKpi = TextView(this).apply {
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(color(R.color.success_text))
            background = roundedBackground(color(R.color.success_surface), color(R.color.success_border), 10)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(6)
            }
        }

        kpiRow.addView(tvWaitingKpi)
        kpiRow.addView(tvSentKpi)

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }
        actions.addView(secondaryButton(getString(R.string.waiting_orders_action)) {
            showOrderList(sent = false)
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            }
        })
        actions.addView(secondaryButton(getString(R.string.sent_orders_action)) {
            showOrderList(sent = true)
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(6)
            }
        })

        val btnClearSent = secondaryButton(getString(R.string.clear_sent_orders_action)) {
            promptClearSentOrders()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        ordersPanel.addView(kpiRow)
        ordersPanel.addView(space(12))
        ordersPanel.addView(actions)
        ordersPanel.addView(space(10))
        ordersPanel.addView(btnClearSent)
        section.addView(ordersPanel)
        return section
    }

    private fun promptClearSentOrders() {
        val sentCount = dbHelper.getSentCount()
        if (sentCount == 0) {
            Toast.makeText(this, "Không có đơn đã xuất để dọn dẹp", Toast.LENGTH_SHORT).show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.clear_sent_orders_action))
            .setMessage(getString(R.string.clear_sent_orders_confirm))
            .setPositiveButton("Dọn dẹp") { _, _ ->
                val deleted = dbHelper.clearSentOrders()
                Toast.makeText(this, getString(R.string.clear_sent_orders_success, deleted), Toast.LENGTH_SHORT).show()
                refreshServiceState()
            }
            .setNegativeButton("Hủy", null)
            .show()
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

        val secondRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 2f
        }
        secondRow.addView(secondaryButton(getString(R.string.view_queue_action)) { viewQueueSummary() }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(6)
            }
        })
        secondRow.addView(secondaryButton(getString(R.string.run_all_diagnostics_action)) { testRunAllDiagnostics() }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(6)
            }
        })

        panel.addView(firstRow)
        panel.addView(space(10))
        panel.addView(secondRow)
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

        val btnCopyLogs = secondaryButton(getString(R.string.copy_logs_action)) {
            val logs = AppLogger.getAllLogs()
            val text = if (logs.isEmpty()) "Nhật ký trống" else logs.joinToString("\n")
            copyToClipboard("Logs", text, getString(R.string.logs_copied_toast))
        }.apply {
            minHeight = dp(44)
            textSize = 12f
            setPadding(dp(10), dp(6), dp(10), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(8) }
        }

        val clearButton = secondaryButton(getString(R.string.clear_logs_action)) {
            AppLogger.clear()
        }.apply {
            minHeight = dp(44)
            textSize = 12f
            setPadding(dp(10), dp(6), dp(10), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(6) }
        }

        headingRow.addView(heading)
        headingRow.addView(btnCopyLogs)
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

    private fun platformCard(platformName: String, colorRes: Int, surfaceRes: Int, borderRes: Int, checked: Boolean): CheckBox {
        return CheckBox(this).apply {
            text = platformName
            isChecked = checked
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(color(R.color.ink))
            minHeight = dp(50)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            buttonTintList = ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
                intArrayOf(color(colorRes), color(R.color.ink_muted))
            )
            background = roundedBackground(color(surfaceRes), color(borderRes), 10)
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

    private fun getLocalIpAddress(): String? {
        return try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                if (intf.isLoopback || !intf.isUp) continue
                val addrs = Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        val hostAddress = addr.hostAddress ?: continue
                        if (!hostAddress.startsWith("127.")) {
                            return hostAddress
                        }
                    }
                }
            }
            null
        } catch (_: Exception) {
            null
        }
    }

    private fun getRawEndpoint(port: Int, lanMode: Boolean): String {
        val ip = getLocalIpAddress()
        return if (lanMode && ip != null) "$ip:$port" else if (lanMode) "0.0.0.0:$port" else "127.0.0.1:$port"
    }

    private fun endpointSummary(port: Int, branchId: Int, lanMode: Boolean): String {
        val rawEndpoint = getRawEndpoint(port, lanMode)
        val branchLabel = if (branchId > 0) "Chi nhánh $branchId" else "Chưa cấu hình chi nhánh"
        return "$rawEndpoint  ·  $branchLabel"
    }

    private fun copyToClipboard(label: String, text: String, toastMessage: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, toastMessage, Toast.LENGTH_SHORT).show()
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
        val lanMode: Boolean,
        val shopeeEnabled: Boolean,
        val greenSmEnabled: Boolean,
        val beEnabled: Boolean
    )

    private fun configFromPrefs(): SavedConfig {
        val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
        return SavedConfig(
            backendUrl = prefs.getString("backend_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000",
            branchId = prefs.getInt("branch_id", 0),
            secret = prefs.getString("secret", "") ?: "",
            port = prefs.getInt("port", 9100),
            lanMode = prefs.getBoolean("lan_mode", false),
            shopeeEnabled = prefs.getBoolean(PrintIntakeService.KEY_SHOPEE_ENABLED, true),
            greenSmEnabled = prefs.getBoolean(PrintIntakeService.KEY_GREEN_SM_ENABLED, true),
            beEnabled = prefs.getBoolean(PrintIntakeService.KEY_BE_ENABLED, true)
        )
    }

    private fun saveCurrentConfig(): SavedConfig {
        val url = etBackendUrl.text.toString().trim()
        val branchId = etBranchId.text.toString().toIntOrNull() ?: 0
        val secret = etSecret.text.toString().trim()
        val port = etPort.text.toString().toIntOrNull() ?: 9100
        val lanMode = cbLanMode.isChecked
        val shopeeEnabled = cbShopeeEnabled.isChecked
        val greenSmEnabled = cbGreenSmEnabled.isChecked
        val beEnabled = cbBeEnabled.isChecked

        getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).edit()
            .putString("backend_url", url)
            .putInt("branch_id", branchId)
            .putString("secret", secret)
            .putInt("port", port)
            .putBoolean("lan_mode", lanMode)
            .putBoolean(PrintIntakeService.KEY_SHOPEE_ENABLED, shopeeEnabled)
            .putBoolean(PrintIntakeService.KEY_GREEN_SM_ENABLED, greenSmEnabled)
            .putBoolean(PrintIntakeService.KEY_BE_ENABLED, beEnabled)
            .apply()

        dispatcher.updateConfig(url, branchId, secret)
        return SavedConfig(
            url,
            branchId,
            secret,
            port,
            lanMode,
            shopeeEnabled,
            greenSmEnabled,
            beEnabled
        )
    }

    private fun toggleService() {
        val config = saveCurrentConfig()

        if (config.branchId <= 0) {
            Toast.makeText(this, "Nhập mã chi nhánh hợp lệ trước khi khởi động", Toast.LENGTH_LONG).show()
            return
        }
        if (!config.shopeeEnabled && !config.greenSmEnabled && !config.beEnabled) {
            Toast.makeText(this, "Bật ít nhất một sàn trước khi khởi động", Toast.LENGTH_LONG).show()
            return
        }

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
        if (config.branchId <= 0) {
            Toast.makeText(this, "Nhập mã chi nhánh hợp lệ trước khi kiểm tra", Toast.LENGTH_LONG).show()
            return
        }
        activityScope.launch {
            Toast.makeText(this@MainActivity, "Đang kiểm tra kết nối POS…", Toast.LENGTH_SHORT).show()
            val startTime = System.currentTimeMillis()
            val result = dispatcher.pingPosServer(config.backendUrl, config.secret, config.branchId)
            val duration = System.currentTimeMillis() - startTime
            if (result.isSuccess) {
                Toast.makeText(this@MainActivity, "Đã kết nối POS (${duration}ms)", Toast.LENGTH_SHORT).show()
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

    private fun testRunAllDiagnostics() {
        val config = saveCurrentConfig()
        if (config.branchId <= 0) {
            Toast.makeText(this, "Nhập mã chi nhánh hợp lệ trước khi kiểm tra", Toast.LENGTH_LONG).show()
            return
        }
        Toast.makeText(this, "Đang chạy kiểm tra toàn diện…", Toast.LENGTH_SHORT).show()
        AppLogger.i("CHẨN ĐOÁN", "--- Bắt đầu kiểm tra toàn diện ---")
        activityScope.launch {
            val startTime = System.currentTimeMillis()
            val posResult = dispatcher.pingPosServer(config.backendUrl, config.secret, config.branchId)
            val duration = System.currentTimeMillis() - startTime
            if (posResult.isSuccess) {
                AppLogger.s("CHẨN ĐOÁN", "1. POS Server: Kết nối tốt (${duration}ms)")
            } else {
                AppLogger.e("CHẨN ĐOÁN", "1. POS Server: Thất bại - ${posResult.exceptionOrNull()?.message}")
            }

            val portResult = withContext(Dispatchers.IO) {
                runCatching {
                    Socket().use { socket ->
                        socket.connect(InetSocketAddress("127.0.0.1", config.port), 2000)
                    }
                }
            }
            if (portResult.isSuccess) {
                AppLogger.s("CHẨN ĐOÁN", "2. Cổng máy in ảo (${config.port}): Đang lắng nghe kết nối")
            } else {
                AppLogger.w("CHẨN ĐOÁN", "2. Cổng máy in ảo (${config.port}): Không thể kết nối (dịch vụ có thể đang dừng)")
            }

            val summary = dbHelper.getQueueSummary()
            AppLogger.i("CHẨN ĐOÁN", "3. Trạng thái hàng đợi:\n$summary")
            AppLogger.i("CHẨN ĐOÁN", "--- Hoàn thành kiểm tra toàn diện ---")
            Toast.makeText(this@MainActivity, "Đã hoàn thành chẩn đoán, xem kết quả trong nhật ký", Toast.LENGTH_SHORT).show()
        }
    }

    private fun refreshServiceState() {
        val port = etPort.text.toString().toIntOrNull() ?: PrintIntakeService.DEFAULT_PORT
        val branchId = etBranchId.text.toString().toIntOrNull() ?: 0
        val lanMode = cbLanMode.isChecked
        tvEndpoint.text = endpointSummary(port, branchId, lanMode)

        val waitingCount = dbHelper.getWaitingCount()
        val sentCount = dbHelper.getSentCount()

        tvWaitingKpi.text = "⏳ Đang chờ: $waitingCount"
        tvSentKpi.text = "🟢 Đã xuất: $sentCount"

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

    private fun viewQueueSummary() {
        val summary = dbHelper.getQueueSummary()
        AppLogger.i("HÀNG ĐỢI", "\n$summary")
        Toast.makeText(this, "Đã cập nhật trạng thái hàng đợi trong nhật ký", Toast.LENGTH_SHORT).show()
    }

    private fun showOrderList(sent: Boolean) {
        val orders = dbHelper.getOrders(sent)
        if (orders.isEmpty()) {
            AlertDialog.Builder(this)
                .setTitle(if (sent) getString(R.string.sent_orders_action) else getString(R.string.waiting_orders_action))
                .setMessage(if (sent) getString(R.string.sent_orders_empty) else getString(R.string.waiting_orders_empty))
                .setPositiveButton(getString(R.string.close_action), null)
                .show()
            return
        }

        val timeFormat = SimpleDateFormat("dd/MM HH:mm", Locale.getDefault())
        val labels = orders.map { order ->
            val pName = platformLabel(order.platform)
            val sName = statusLabel(order.status)
            "#${order.id} · $pName\n$sName · ${timeFormat.format(Date(order.createdAt))}"
        }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle(if (sent) getString(R.string.sent_orders_action) else getString(R.string.waiting_orders_action))
            .setItems(labels) { _, index -> orders.getOrNull(index)?.let(::showOrderDetail) }
            .setNegativeButton(getString(R.string.close_action), null)
            .show()
    }

    private fun showOrderDetail(order: OrderQueueDbHelper.QueuedOrder) {
        val timeFormat = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault())
        val detailLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(16))
        }

        val infoCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = roundedBackground(color(R.color.surface_muted), color(R.color.border), 10)
        }

        fun infoRow(label: String, value: String): LinearLayout {
            return LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(3), 0, dp(3))
                addView(TextView(this@MainActivity).apply {
                    text = label
                    textSize = 13f
                    setTextColor(color(R.color.ink_muted))
                    layoutParams = LinearLayout.LayoutParams(dp(110), LinearLayout.LayoutParams.WRAP_CONTENT)
                })
                addView(TextView(this@MainActivity).apply {
                    text = value
                    textSize = 13f
                    setTextColor(color(R.color.ink))
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                })
            }
        }

        infoCard.addView(infoRow("Trạng thái:", statusLabel(order.status)))
        infoCard.addView(infoRow("Sàn:", platformLabel(order.platform)))
        infoCard.addView(infoRow("Chi nhánh:", order.branchId.toString()))
        infoCard.addView(infoRow("Thời gian nhận:", timeFormat.format(Date(order.createdAt))))
        infoCard.addView(infoRow("Số lần gửi lại:", order.retryCount.toString()))
        detailLayout.addView(infoCard)

        if (!order.lastError.isNullOrBlank()) {
            detailLayout.addView(space(12))
            val errorBox = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = roundedBackground(color(R.color.warning_surface), color(R.color.warning_border), 10)
                addView(TextView(this@MainActivity).apply {
                    text = "Lỗi gần nhất:"
                    textSize = 12f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(color(R.color.warning_text))
                })
                addView(TextView(this@MainActivity).apply {
                    text = order.lastError
                    textSize = 12.5f
                    setTextColor(color(R.color.ink))
                    setPadding(0, dp(4), 0, 0)
                })
            }
            detailLayout.addView(errorBox)
        }

        if (!order.remoteResponse.isNullOrBlank()) {
            detailLayout.addView(space(12))
            val responseBox = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = roundedBackground(color(R.color.success_surface), color(R.color.success_border), 10)
                addView(TextView(this@MainActivity).apply {
                    text = "Phản hồi POS:"
                    textSize = 12f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(color(R.color.success_text))
                })
                addView(TextView(this@MainActivity).apply {
                    text = order.remoteResponse
                    textSize = 12f
                    typeface = Typeface.MONOSPACE
                    setTextColor(color(R.color.ink))
                    setPadding(0, dp(4), 0, 0)
                })
            }
            detailLayout.addView(responseBox)
        }

        detailLayout.addView(space(14))
        val ocrHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        ocrHeader.addView(TextView(this).apply {
            text = "Nội dung OCR phiếu:"
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(color(R.color.ink))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })

        val ocrContent = order.receiptText?.ifBlank { "Không có nội dung OCR" } ?: "Không có nội dung OCR"
        val btnCopyOcr = secondaryButton(getString(R.string.copy_ocr_action)) {
            copyToClipboard("OCR Text", ocrContent, getString(R.string.ocr_copied_toast))
        }.apply {
            minHeight = dp(38)
            textSize = 12f
            setPadding(dp(8), dp(4), dp(8), dp(4))
        }
        ocrHeader.addView(btnCopyOcr)
        detailLayout.addView(ocrHeader)
        detailLayout.addView(space(6))

        val ocrScrollView = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(160)
            )
            isFillViewport = true
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = roundedBackground(color(R.color.console), color(R.color.console_border), 10)
        }
        val tvOcr = TextView(this).apply {
            text = ocrContent
            textSize = 11.5f
            typeface = Typeface.MONOSPACE
            setTextColor(color(R.color.console_text))
            setTextIsSelectable(true)
        }
        ocrScrollView.addView(tvOcr)
        detailLayout.addView(ocrScrollView)

        val rootScroll = ScrollView(this).apply {
            addView(detailLayout)
        }

        val builder = AlertDialog.Builder(this)
            .setTitle(getString(R.string.order_detail_title, order.id))
            .setView(rootScroll)
            .setNegativeButton(getString(R.string.close_action), null)

        if (order.status == OrderQueueDbHelper.STATUS_PENDING || order.status == OrderQueueDbHelper.STATUS_UNCLASSIFIED) {
            builder.setPositiveButton(getString(R.string.retry_now_action)) { _, _ ->
                if (dbHelper.retryOrderNow(order.id)) {
                    Toast.makeText(this, "Đã đưa đơn #${order.id} lên đầu hàng chờ", Toast.LENGTH_SHORT).show()
                    refreshServiceState()
                }
            }
        }
        builder.show()
    }

    private fun statusLabel(status: String): String = when (status) {
        OrderQueueDbHelper.STATUS_SENT -> "Đã xuất lên POS"
        OrderQueueDbHelper.STATUS_SENDING -> "Đang gửi"
        OrderQueueDbHelper.STATUS_UNCLASSIFIED -> "Cần kiểm tra"
        else -> "Đang chờ"
    }

    private fun platformLabel(platform: String): String = when (platform) {
        "shopee" -> "ShopeeFood"
        "greensm" -> "Green SM Food"
        "be" -> "beFood"
        else -> "Chưa rõ sàn"
    }

    private fun updateLogsView() {
        val logs = AppLogger.getAllLogs()
        if (logs.isEmpty()) {
            tvLogs.text = "--- Nhật ký trống ---\nKiểm tra POS hoặc gửi lệnh in để xem sự kiện tại đây."
            return
        }

        val ssb = SpannableStringBuilder()
        val tsColor = color(R.color.console_timestamp)
        val successColor = color(R.color.console_tag_success)
        val errorColor = color(R.color.console_tag_error)
        val warnColor = color(R.color.console_tag_warning)
        val posColor = color(R.color.console_tag_pos)
        val printColor = color(R.color.console_tag_print)
        val defaultTextColor = color(R.color.console_text)

        for ((index, line) in logs.withIndex()) {
            if (index > 0) ssb.append("\n")
            val start = ssb.length
            ssb.append(line)
            val end = ssb.length

            if (line.startsWith("[") && line.length >= 10 && line[9] == ']') {
                ssb.setSpan(
                    ForegroundColorSpan(tsColor),
                    start,
                    start + 10,
                    Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                )
            }

            val lineToneColor = when {
                line.contains("🔴") || line.contains("LỖI") || line.contains("ERROR") || line.contains("Thất bại") -> errorColor
                line.contains("🟢") || line.contains("THÀNH CÔNG") || line.contains("thành công") -> successColor
                line.contains("🟡") || line.contains("CẢNH BÁO") || line.contains("RETRY") -> warnColor
                line.contains("🚀") || line.contains("POS") -> posColor
                line.contains("🖨️") || line.contains("IN ẤN") -> printColor
                else -> defaultTextColor
            }

            val tagStart = if (line.startsWith("[") && line.length >= 10) start + 10 else start
            ssb.setSpan(
                ForegroundColorSpan(lineToneColor),
                tagStart,
                end,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }

        tvLogs.text = ssb
        scrollLogs.post {
            scrollLogs.fullScroll(ScrollView.FOCUS_DOWN)
        }
    }
}
