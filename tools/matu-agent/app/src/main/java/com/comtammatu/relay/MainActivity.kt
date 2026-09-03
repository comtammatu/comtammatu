package com.comtammatu.relay

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.method.PasswordTransformationMethod
import android.text.style.ForegroundColorSpan
import android.util.Base64
import android.view.Gravity
import android.view.Menu
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.checkbox.MaterialCheckBox
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.navigationrail.NavigationRailView
import com.google.android.material.tabs.TabLayout
import com.google.android.material.textfield.TextInputEditText
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

class MainActivity : AppCompatActivity() {
    companion object {
        const val ACTION_START_AGENT = "com.comtammatu.relay.action.START_AGENT"
        private const val NOTIFICATION_PERMISSION_REQUEST = 401
        private const val STATE_DESTINATION = "selected_destination"
        private const val DESTINATION_OVERVIEW = 100
        private const val DESTINATION_RECEIPTS = 101
        private const val DESTINATION_DEVICE = 102
        private const val DESTINATION_LOGS = 103
    }

    private lateinit var etBackendUrl: EditText
    private lateinit var etBranchId: EditText
    private lateinit var etSecret: EditText
    private lateinit var btnToggleSecret: Button
    private var isSecretVisible = false
    private lateinit var etPort: EditText
    private lateinit var cbLanMode: CompoundButton
    private lateinit var cbShopeeEnabled: CompoundButton
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
    private lateinit var toolbar: MaterialToolbar
    private lateinit var screenContainer: FrameLayout
    private lateinit var orderTabs: TabLayout
    private lateinit var orderListContainer: LinearLayout
    private lateinit var clearResolvedButton: Button
    private val destinationViews = mutableMapOf<Int, View>()
    private var currentDestination = DESTINATION_OVERVIEW
    private var showingResolvedOrders = false
    private var navigationBar: BottomNavigationView? = null
    private var navigationRail: NavigationRailView? = null
    private var applyingProgrammaticSelection = false

    private val activityScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var dbHelper: OrderQueueDbHelper
    private lateinit var dispatcher: WebhookDispatcher
    private var startAfterNotificationPermission = false

    private val logListener = { _: String ->
        updateLogsView()
        refreshServiceState()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        val isNight = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !isNight
            isAppearanceLightNavigationBars = !isNight
        }
        AgentNotifications.ensureChannels(this)

        dbHelper = OrderQueueDbHelper(this)

        val saved = configFromPrefs()
        dispatcher = WebhookDispatcher(this, saved.backendUrl, saved.branchId, saved.secret)

        setContentView(createAdaptiveAppShell(saved))
        currentDestination = savedInstanceState?.getInt(
            STATE_DESTINATION,
            DESTINATION_OVERVIEW
        ) ?: DESTINATION_OVERVIEW
        selectDestination(currentDestination)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (currentDestination != DESTINATION_OVERVIEW) {
                    selectDestination(DESTINATION_OVERVIEW)
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        AppLogger.i("GIAO DIỆN", "Khởi động Má Tư Agent")
        updateLogsView()
        refreshServiceState()
        handleOperationalAction(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt(STATE_DESTINATION, currentDestination)
        super.onSaveInstanceState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOperationalAction(intent)
    }

    private fun handleOperationalAction(intent: Intent) {
        if (intent.action == ACTION_START_AGENT && !PrintIntakeService.isServiceRunning) {
            btnToggle.post { toggleService() }
        }
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

    private fun createAdaptiveAppShell(saved: SavedConfig): View {
        destinationViews.clear()
        destinationViews[DESTINATION_OVERVIEW] = createOverviewDestination(saved)
        destinationViews[DESTINATION_RECEIPTS] = createReceiptsDestination()
        destinationViews[DESTINATION_DEVICE] = createDeviceDestination(saved)
        destinationViews[DESTINATION_LOGS] = createLogsDestination()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(color(R.color.canvas))
        }

        toolbar = MaterialToolbar(this).apply {
            title = getString(R.string.app_name)
            subtitle = getString(R.string.brand_subtitle)
            setTitleTextColor(color(R.color.ink))
            setSubtitleTextColor(color(R.color.ink_muted))
            setBackgroundColor(color(R.color.surface))
            contentInsetStartWithNavigation = dimen(R.dimen.space_page)
            setContentInsetsRelative(dimen(R.dimen.space_page), dimen(R.dimen.space_section))
            minimumHeight = dp(64)
        }
        val toolbarTopPadding = toolbar.paddingTop
        ViewCompat.setOnApplyWindowInsetsListener(toolbar) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.statusBars())
            view.setPadding(view.paddingLeft, toolbarTopPadding + bars.top, view.paddingRight, view.paddingBottom)
            insets
        }
        root.addView(toolbar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        screenContainer = FrameLayout(this).apply {
            setBackgroundColor(color(R.color.canvas))
        }

        val isExpanded = resources.configuration.smallestScreenWidthDp >= 600
        if (isExpanded) {
            val body = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
            }
            navigationRail = NavigationRailView(this).apply {
                setBackgroundColor(color(R.color.surface_container))
                menuGravity = Gravity.CENTER
                addNavigationItems(menu)
                setOnItemSelectedListener { item ->
                    if (AgentNavigationPolicy.shouldHandleItemSelection(applyingProgrammaticSelection)) {
                        selectDestination(item.itemId)
                    }
                    true
                }
            }
            navigationRail?.let { rail ->
                val bottomPadding = rail.paddingBottom
                ViewCompat.setOnApplyWindowInsetsListener(rail) { view, insets ->
                    val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                    view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, bottomPadding + bars.bottom)
                    insets
                }
                body.addView(rail, LinearLayout.LayoutParams(dp(88), LinearLayout.LayoutParams.MATCH_PARENT))
            }
            body.addView(screenContainer, LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.MATCH_PARENT,
                1f
            ))
            root.addView(body, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            ))
        } else {
            root.addView(screenContainer, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            ))
            navigationBar = BottomNavigationView(this).apply {
                setBackgroundColor(color(R.color.surface_container))
                labelVisibilityMode = com.google.android.material.navigation.NavigationBarView.LABEL_VISIBILITY_LABELED
                addNavigationItems(menu)
                setOnItemSelectedListener { item ->
                    if (AgentNavigationPolicy.shouldHandleItemSelection(applyingProgrammaticSelection)) {
                        selectDestination(item.itemId)
                    }
                    true
                }
            }
            navigationBar?.let { bar ->
                val bottomPadding = bar.paddingBottom
                ViewCompat.setOnApplyWindowInsetsListener(bar) { view, insets ->
                    val bars = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
                    view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, bottomPadding + bars.bottom)
                    insets
                }
                root.addView(bar, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ))
            }
        }
        return root
    }

    private fun addNavigationItems(menu: Menu) {
        menu.add(Menu.NONE, DESTINATION_OVERVIEW, 0, getString(R.string.nav_overview))
            .setIcon(R.drawable.ic_nav_home)
        menu.add(Menu.NONE, DESTINATION_RECEIPTS, 1, getString(R.string.nav_receipts))
            .setIcon(R.drawable.ic_nav_receipts)
        menu.add(Menu.NONE, DESTINATION_DEVICE, 2, getString(R.string.nav_device))
            .setIcon(R.drawable.ic_nav_device)
        menu.add(Menu.NONE, DESTINATION_LOGS, 3, getString(R.string.nav_logs))
            .setIcon(R.drawable.ic_nav_logs)
    }

    private fun selectDestination(destination: Int) {
        val next = destinationViews[destination] ?: destinationViews.getValue(DESTINATION_OVERVIEW)
        currentDestination = if (destinationViews.containsKey(destination)) destination else DESTINATION_OVERVIEW
        screenContainer.removeAllViews()
        (next.parent as? android.view.ViewGroup)?.removeView(next)
        screenContainer.addView(next, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        when (currentDestination) {
            DESTINATION_RECEIPTS -> {
                toolbar.title = getString(R.string.orders_title)
                toolbar.subtitle = getString(R.string.receipt_layers_subtitle)
                renderOrderList()
            }
            DESTINATION_DEVICE -> {
                toolbar.title = getString(R.string.nav_device)
                toolbar.subtitle = getString(R.string.device_subtitle)
            }
            DESTINATION_LOGS -> {
                toolbar.title = getString(R.string.logs_title)
                toolbar.subtitle = getString(R.string.logs_nav_subtitle)
                updateLogsView()
            }
            else -> {
                toolbar.title = getString(R.string.app_name)
                toolbar.subtitle = getString(R.string.brand_subtitle)
            }
        }
        applyingProgrammaticSelection = true
        try {
            if (navigationBar?.selectedItemId != currentDestination) {
                navigationBar?.selectedItemId = currentDestination
            }
            if (navigationRail?.selectedItemId != currentDestination) {
                navigationRail?.selectedItemId = currentDestination
            }
        } finally {
            applyingProgrammaticSelection = false
        }
    }

    private fun destinationScroll(content: LinearLayout.() -> Unit): ScrollView {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                dimen(R.dimen.space_page),
                dimen(R.dimen.space_page),
                dimen(R.dimen.space_page),
                dimen(R.dimen.space_group)
            )
            content()
        }
        return ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setBackgroundColor(color(R.color.canvas))
            addView(layout)
        }
    }

    private fun createOverviewDestination(saved: SavedConfig): View = destinationScroll {
        addView(createServicePanel(saved))
        addView(spaceResource(R.dimen.space_group))
        addView(createHomeQueueSummary())
    }

    private fun createReceiptsDestination(): View = destinationScroll {
        addView(createOrderManagementSection())
    }

    private fun createDeviceDestination(saved: SavedConfig): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(color(R.color.canvas))
        }
        val tabs = TabLayout(this).apply {
            setBackgroundColor(color(R.color.surface))
            addTab(newTab().setText(R.string.device_tab_connection))
            addTab(newTab().setText(R.string.device_tab_background))
            addTab(newTab().setText(R.string.device_tab_diagnostics))
        }
        val content = FrameLayout(this)
        val pages = listOf(
            destinationScroll { addView(createConfigurationSection(saved)) },
            destinationScroll { addView(createBackgroundReliabilitySection()) },
            destinationScroll { addView(createDiagnosticsSection()) }
        )
        fun showPage(position: Int) {
            content.removeAllViews()
            val page = pages.getOrElse(position) { pages.first() }
            (page.parent as? android.view.ViewGroup)?.removeView(page)
            content.addView(page, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        }
        tabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) = showPage(tab.position)
            override fun onTabUnselected(tab: TabLayout.Tab) = Unit
            override fun onTabReselected(tab: TabLayout.Tab) = Unit
        })
        root.addView(tabs, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))
        root.addView(content, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))
        showPage(0)
        return root
    }

    private fun createLogsDestination(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(
            dimen(R.dimen.space_page),
            dimen(R.dimen.space_page),
            dimen(R.dimen.space_page),
            dimen(R.dimen.space_group)
        )
        setBackgroundColor(color(R.color.canvas))
        addView(createLogSection(), LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))
    }

    private fun createHomeQueueSummary(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.home_attention_title),
            getString(R.string.home_attention_description)
        ))
        section.addView(space(10))
        val body = panel()
        body.addView(queueLinkRow(
            title = getString(R.string.waiting_orders_action),
            description = getString(R.string.waiting_orders_home_description),
            toneColor = color(R.color.warning_text),
            onClick = {
                showingResolvedOrders = false
                selectDestination(DESTINATION_RECEIPTS)
                orderTabs.getTabAt(0)?.select()
            }
        ).let { (row, count) ->
            tvWaitingKpi = count
            row
        })
        body.addView(divider())
        body.addView(queueLinkRow(
            title = getString(R.string.resolved_orders_action),
            description = getString(R.string.resolved_orders_home_description),
            toneColor = color(R.color.success_text),
            onClick = {
                showingResolvedOrders = true
                selectDestination(DESTINATION_RECEIPTS)
                orderTabs.getTabAt(1)?.select()
            }
        ).let { (row, count) ->
            tvSentKpi = count
            row
        })
        section.addView(body)
        return section
    }

    private fun queueLinkRow(
        title: String,
        description: String,
        toneColor: Int,
        onClick: () -> Unit
    ): Pair<LinearLayout, TextView> {
        val count = TextView(this).apply {
            text = "0"
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(toneColor)
            gravity = Gravity.CENTER
            minWidth = dp(44)
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(72)
            isClickable = true
            isFocusable = true
            setPadding(dp(4), dp(8), dp(4), dp(8))
            setOnClickListener { onClick() }
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                addView(TextView(this@MainActivity).apply {
                    text = title
                    textSize = 15f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(color(R.color.ink))
                })
                addView(TextView(this@MainActivity).apply {
                    text = description
                    textSize = 12.5f
                    setTextColor(color(R.color.ink_muted))
                    setPadding(0, dp(3), dp(8), 0)
                })
            })
            addView(count)
        }
        return row to count
    }

    private fun divider(): View = View(this).apply {
        setBackgroundColor(color(R.color.border))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
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

        btnToggle = MaterialButton(this).apply {
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

    private fun createBackgroundReliabilitySection(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.background_run_title),
            getString(R.string.background_run_description)
        ))
        section.addView(space(10))

        val panel = panel()
        panel.addView(TextView(this).apply {
            text = getString(R.string.background_run_steps)
            textSize = 13f
            setTextColor(color(R.color.ink_secondary))
            setLineSpacing(dp(3).toFloat(), 1f)
        })
        panel.addView(space(14))
        panel.addView(secondaryButton(getString(R.string.open_redmi_autostart_action)) {
            openRedmiAutoStartSettings()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })
        panel.addView(space(8))
        panel.addView(secondaryButton(getString(R.string.allow_background_power_action)) {
            openBackgroundPowerSettings()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })
        panel.addView(space(8))
        panel.addView(secondaryButton(getString(R.string.configure_order_alerts_action)) {
            openIncomingOrderNotificationSettings()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })
        panel.addView(space(8))
        panel.addView(secondaryButton(getString(R.string.test_order_alert_action)) {
            testIncomingOrderAlert()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })
        section.addView(panel)
        return section
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

        cbLanMode = MaterialSwitch(this).apply {
            text = getString(R.string.lan_mode_label)
            isChecked = saved.lanMode
            textSize = 14f
            setTextColor(color(R.color.ink))
            minHeight = dp(52)
            setPadding(dp(10), dp(8), dp(10), dp(8))
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

        cbShopeeEnabled = platformCard(
            "ShopeeFood · máy in mạng",
            R.color.shopee_orange,
            R.color.shopee_surface,
            R.color.shopee_border,
            saved.shopeeEnabled
        )
        panel.addView(cbShopeeEnabled)
        panel.addView(space(8))
        panel.addView(sourceStatusCard(
            platformName = "Green SM Food",
            status = getString(R.string.source_not_supported_status),
            description = getString(R.string.greensm_not_supported_description),
            colorRes = R.color.greensm_green,
            surfaceRes = R.color.greensm_surface,
            borderRes = R.color.greensm_border
        ))
        panel.addView(space(8))
        panel.addView(sourceStatusCard(
            platformName = "beFood",
            status = getString(R.string.source_not_supported_status),
            description = getString(R.string.befood_not_supported_description),
            colorRes = R.color.befood_yellow,
            surfaceRes = R.color.befood_surface,
            borderRes = R.color.befood_border
        ))

        section.addView(panel)
        return section
    }

    private fun createOrderManagementSection(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.receipts_received_title),
            getString(R.string.orders_description)
        ))
        section.addView(space(12))

        orderTabs = TabLayout(this).apply {
            addTab(newTab().setText(getString(R.string.waiting_orders_action)))
            addTab(newTab().setText(getString(R.string.resolved_orders_action)))
            addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
                override fun onTabSelected(tab: TabLayout.Tab) {
                    showingResolvedOrders = tab.position == 1
                    renderOrderList()
                }
                override fun onTabUnselected(tab: TabLayout.Tab) = Unit
                override fun onTabReselected(tab: TabLayout.Tab) = Unit
            })
        }
        section.addView(orderTabs, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))
        section.addView(space(12))

        orderListContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        section.addView(orderListContainer)

        clearResolvedButton = secondaryButton(getString(R.string.clear_resolved_orders_action)) {
            promptClearResolvedOrders()
        }.apply {
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(16) }
        }
        section.addView(clearResolvedButton)
        renderOrderList()
        return section
    }

    private fun renderOrderList() {
        if (!::orderListContainer.isInitialized) return
        val waitingCount = dbHelper.getWaitingCount()
        val resolvedCount = dbHelper.getResolvedCount()
        orderTabs.getTabAt(0)?.text = getString(R.string.order_tab_with_count, getString(R.string.waiting_orders_action), waitingCount)
        orderTabs.getTabAt(1)?.text = getString(R.string.order_tab_with_count, getString(R.string.resolved_orders_action), resolvedCount)

        orderListContainer.removeAllViews()
        clearResolvedButton.visibility = if (showingResolvedOrders && resolvedCount > 0) View.VISIBLE else View.GONE
        val orders = dbHelper.getOrders(showingResolvedOrders)
        if (orders.isEmpty()) {
            orderListContainer.addView(TextView(this).apply {
                text = if (showingResolvedOrders) {
                    getString(R.string.resolved_orders_empty)
                } else {
                    getString(R.string.waiting_orders_empty)
                }
                textSize = 14f
                gravity = Gravity.CENTER
                setTextColor(color(R.color.ink_muted))
                setPadding(dp(20), dp(40), dp(20), dp(40))
                background = roundedBackground(color(R.color.surface_muted), color(R.color.border), 16)
            })
            return
        }

        orders.forEachIndexed { index, order ->
            if (index > 0) orderListContainer.addView(space(8))
            orderListContainer.addView(createOrderRow(order))
        }
    }

    private fun createOrderRow(order: OrderQueueDbHelper.QueuedOrder): View {
        val timeFormat = SimpleDateFormat("dd/MM · HH:mm", Locale.getDefault())
        val sourceRef = OrderIdentity.displaySourceOrderRef(order.platform, order.sourceOrderRef)
            ?: getString(R.string.receipt_internal_ref, order.id)
        val status = statusLabel(order.status)
        val statusTone = when (order.status) {
            OrderQueueDbHelper.STATUS_SENT, OrderQueueDbHelper.STATUS_DISMISSED -> color(R.color.success_text)
            OrderQueueDbHelper.STATUS_BLOCKED, OrderQueueDbHelper.STATUS_UNCLASSIFIED -> color(R.color.warning_text)
            else -> color(R.color.ink_secondary)
        }
        val statusSurface = when (order.status) {
            OrderQueueDbHelper.STATUS_SENT, OrderQueueDbHelper.STATUS_DISMISSED -> color(R.color.success_surface)
            OrderQueueDbHelper.STATUS_BLOCKED, OrderQueueDbHelper.STATUS_UNCLASSIFIED -> color(R.color.warning_surface)
            else -> color(R.color.surface_muted)
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            minimumHeight = dp(84)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = roundedBackground(color(R.color.surface), color(R.color.border), 14)
            isClickable = true
            isFocusable = true
            contentDescription = "$sourceRef, ${platformLabel(order.platform)}, $status"
            setOnClickListener { showOrderDetail(order) }
        }
        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = sourceRef
                textSize = 16f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setTextColor(color(R.color.ink))
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(TextView(this@MainActivity).apply {
                text = status
                textSize = 11.5f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setTextColor(statusTone)
                setPadding(dp(10), dp(5), dp(10), dp(5))
                background = roundedBackground(statusSurface, statusSurface, 50)
            })
        })
        val mapping = when {
            order.status == OrderQueueDbHelper.STATUS_DISMISSED -> getString(R.string.manual_entry_short)
            showingResolvedOrders -> {
                val posRef = OrderIdentity.displaySourceOrderRef(
                    order.platform,
                    order.posDisplayId ?: order.posOrderNumber
                ) ?: getString(R.string.pos_ref_missing)
                getString(R.string.pos_mapping_short, posRef)
            }
            else -> status
        }
        row.addView(TextView(this).apply {
            text = getString(
                R.string.order_row_metadata,
                platformLabel(order.platform),
                mapping,
                timeFormat.format(Date(order.createdAt))
            )
            textSize = 12.5f
            setTextColor(color(R.color.ink_muted))
            setPadding(0, dp(6), 0, 0)
        })
        if (order.duplicateCount > 0) {
            row.addView(TextView(this).apply {
                text = getString(R.string.duplicate_blocked_short, order.duplicateCount)
                textSize = 12f
                setTextColor(color(R.color.warning_text))
                setPadding(0, dp(5), 0, 0)
            })
        }
        return row
    }

    private fun promptClearResolvedOrders() {
        val resolvedCount = dbHelper.getResolvedCount()
        if (resolvedCount == 0) {
            Toast.makeText(this, "Không có đơn đã xử lý để dọn dẹp", Toast.LENGTH_SHORT).show()
            return
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.clear_resolved_orders_action))
            .setMessage(getString(R.string.clear_resolved_orders_confirm))
            .setPositiveButton("Dọn dẹp") { _, _ ->
                val compacted = dbHelper.compactResolvedOrders()
                Toast.makeText(this, getString(R.string.clear_resolved_orders_success, compacted), Toast.LENGTH_SHORT).show()
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
        panel.addView(secondaryButton(getString(R.string.check_pos_action)) { testPingPos() })
        panel.addView(space(8))
        panel.addView(secondaryButton(getString(R.string.check_print_port_action)) { testPrintPort() })
        panel.addView(space(8))
        panel.addView(secondaryButton(getString(R.string.view_queue_action)) { viewQueueSummary() })
        panel.addView(space(8))
        panel.addView(secondaryButton(getString(R.string.run_all_diagnostics_action)) { testRunAllDiagnostics() })
        section.addView(panel)
        return section
    }

    private fun createLogSection(): View {
        val section = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        section.addView(sectionHeading(
            getString(R.string.logs_title),
            getString(R.string.logs_description)
        ))
        section.addView(space(10))

        val btnCopyLogs = secondaryButton(getString(R.string.copy_logs_action)) {
            val logs = AppLogger.getAllLogs()
            val text = if (logs.isEmpty()) "Nhật ký trống" else logs.joinToString("\n")
            copyToClipboard("Logs", text, getString(R.string.logs_copied_toast))
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dimen(R.dimen.space_tight)
            }
        }

        val clearButton = secondaryButton(getString(R.string.clear_logs_action)) {
            AppLogger.clear()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dimen(R.dimen.space_tight)
            }
        }

        section.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(btnCopyLogs)
            addView(clearButton)
        })
        section.addView(space(10))

        scrollLogs = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            isFillViewport = true
            val sectionSpace = dimen(R.dimen.space_section)
            setPadding(sectionSpace, sectionSpace, sectionSpace, sectionSpace)
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
            setLineSpacing(dimen(R.dimen.space_tight).toFloat(), 1.08f)
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
            val sectionSpace = dimen(R.dimen.space_section)
            setPadding(sectionSpace, sectionSpace, sectionSpace, sectionSpace)
            background = roundedBackgroundPx(
                color(R.color.surface),
                color(R.color.border),
                dimen(R.dimen.radius_card).toFloat()
            )
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
        return TextInputEditText(this).apply {
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

    private fun platformCard(platformName: String, colorRes: Int, surfaceRes: Int, borderRes: Int, checked: Boolean): CompoundButton {
        return MaterialCheckBox(this).apply {
            text = platformName
            isChecked = checked
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(color(R.color.ink))
            minHeight = dimen(R.dimen.touch_target)
            setPadding(
                dimen(R.dimen.space_content),
                dimen(R.dimen.space_small),
                dimen(R.dimen.space_content),
                dimen(R.dimen.space_small)
            )
            buttonTintList = ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
                intArrayOf(color(colorRes), color(R.color.ink_muted))
            )
            background = roundedBackground(color(surfaceRes), color(borderRes), 10)
        }
    }

    private fun sourceStatusCard(
        platformName: String,
        status: String,
        description: String,
        colorRes: Int,
        surfaceRes: Int,
        borderRes: Int
    ): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            minimumHeight = dp(72)
            setPadding(dp(14), dp(11), dp(14), dp(11))
            background = roundedBackground(color(surfaceRes), color(borderRes), 10)

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(View(this@MainActivity).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(8), dp(8)).apply {
                        marginEnd = dp(9)
                    }
                    background = circleBackground(color(colorRes))
                })
                addView(TextView(this@MainActivity).apply {
                    text = platformName
                    textSize = 14f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(color(R.color.ink))
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(TextView(this@MainActivity).apply {
                    text = status
                    textSize = 11.5f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(color(R.color.warning_text))
                })
            })
            addView(TextView(this@MainActivity).apply {
                text = description
                textSize = 12f
                setTextColor(color(R.color.ink_muted))
                setPadding(dp(17), dp(4), 0, 0)
            })
        }
    }

    private fun secondaryButton(label: String, onClick: () -> Unit): Button {
        return MaterialButton(
            this,
            null,
            com.google.android.material.R.attr.materialButtonOutlinedStyle
        ).apply {
            text = label
            isAllCaps = false
            textSize = 13f
            minHeight = dimen(R.dimen.touch_target)
            setPadding(
                dimen(R.dimen.space_content),
                dimen(R.dimen.space_small),
                dimen(R.dimen.space_content),
                dimen(R.dimen.space_small)
            )
            setTextColor(color(R.color.ink))
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            insetTop = 0
            insetBottom = 0
            cornerRadius = dimen(R.dimen.radius_control)
            strokeWidth = dp(1)
            strokeColor = ColorStateList.valueOf(color(R.color.input_border))
            backgroundTintList = ColorStateList.valueOf(color(R.color.surface))
            rippleColor = ColorStateList.valueOf(color(R.color.surface_container_high))
            setOnClickListener { onClick() }
        }
    }

    private fun stylePrimaryButton(button: Button, destructive: Boolean) {
        val normal = color(if (destructive) R.color.destructive else R.color.primary)
        val pressed = color(if (destructive) R.color.destructive_pressed else R.color.primary_pressed)
        button.setTextColor(ColorStateList(
            arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
            intArrayOf(color(R.color.ink_muted), color(R.color.on_primary))
        ))
        if (button is MaterialButton) {
            button.insetTop = 0
            button.insetBottom = 0
            button.cornerRadius = dimen(R.dimen.radius_control)
            button.strokeWidth = 0
            button.backgroundTintList = ColorStateList.valueOf(normal)
            button.rippleColor = ColorStateList.valueOf(pressed)
        } else {
            button.background = buttonBackground(normal, pressed, normal)
        }
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
        return roundedBackgroundPx(fillColor, strokeColor, dp(radius).toFloat())
    }

    private fun roundedBackgroundPx(
        fillColor: Int,
        strokeColor: Int,
        radiusPx: Float
    ): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fillColor)
            setStroke(dp(1), strokeColor)
            cornerRadius = radiusPx
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

    private fun spaceResource(resourceId: Int): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dimen(resourceId))
        }
    }

    private fun dimen(resourceId: Int): Int = resources.getDimensionPixelSize(resourceId)

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
        return "$rawEndpoint\n$branchLabel"
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

    private data class SavedConfig(
        val backendUrl: String,
        val branchId: Int,
        val secret: String,
        val port: Int,
        val lanMode: Boolean,
        val shopeeEnabled: Boolean
    )

    private fun configFromPrefs(): SavedConfig {
        val prefs = getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE)
        return SavedConfig(
            backendUrl = prefs.getString("backend_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000",
            branchId = prefs.getInt("branch_id", 0),
            secret = prefs.getString("secret", "") ?: "",
            port = prefs.getInt("port", 9100),
            lanMode = prefs.getBoolean("lan_mode", false),
            shopeeEnabled = prefs.getBoolean(PrintIntakeService.KEY_SHOPEE_ENABLED, true)
        )
    }

    private fun saveCurrentConfig(): SavedConfig {
        val url = etBackendUrl.text.toString().trim()
        val branchId = etBranchId.text.toString().toIntOrNull() ?: 0
        val secret = etSecret.text.toString().trim()
        val port = etPort.text.toString().toIntOrNull() ?: 9100
        val lanMode = cbLanMode.isChecked
        val shopeeEnabled = cbShopeeEnabled.isChecked

        getSharedPreferences("bridge_prefs", Context.MODE_PRIVATE).edit()
            .putString("backend_url", url)
            .putInt("branch_id", branchId)
            .putString("secret", secret)
            .putInt("port", port)
            .putBoolean("lan_mode", lanMode)
            .putBoolean(PrintIntakeService.KEY_SHOPEE_ENABLED, shopeeEnabled)
            .apply()

        dispatcher.updateConfig(url, branchId, secret)
        return SavedConfig(
            url,
            branchId,
            secret,
            port,
            lanMode,
            shopeeEnabled
        )
    }

    private fun toggleService() {
        val config = saveCurrentConfig()

        if (config.branchId <= 0) {
            Toast.makeText(this, "Nhập mã chi nhánh hợp lệ trước khi khởi động", Toast.LENGTH_LONG).show()
            return
        }
        if (!config.shopeeEnabled) {
            Toast.makeText(this, "Bật nguồn ShopeeFood trước khi khởi động", Toast.LENGTH_LONG).show()
            return
        }
        if (
            !PrintIntakeService.isServiceRunning &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            startAfterNotificationPermission = true
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST
            )
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
            getSharedPreferences(PrintIntakeService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PrintIntakeService.KEY_AGENT_ENABLED, true)
                .apply()
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
            getSharedPreferences(PrintIntakeService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PrintIntakeService.KEY_AGENT_ENABLED, false)
                .apply()
            intent.action = PrintIntakeService.ACTION_STOP
            startService(intent)
            btnToggle.postDelayed({ refreshServiceState() }, 200)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return

        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        val shouldStart = startAfterNotificationPermission
        startAfterNotificationPermission = false
        if (granted) {
            if (shouldStart) toggleService()
        } else {
            Toast.makeText(
                this,
                getString(R.string.notification_permission_required),
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun openRedmiAutoStartSettings() {
        val redmiIntent = Intent().apply {
            component = ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
            putExtra("package_name", packageName)
        }
        if (runCatching { startActivity(redmiIntent) }.isFailure) {
            openAppDetails()
        }
    }

    private fun openBackgroundPowerSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                val requestIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                if (runCatching { startActivity(requestIntent) }.isSuccess) return
            }
        }
        openAppDetails()
    }

    private fun openIncomingOrderNotificationSettings() {
        AgentNotifications.ensureChannels(this)
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            startAfterNotificationPermission = false
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST
            )
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelIntent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                putExtra(
                    Settings.EXTRA_CHANNEL_ID,
                    AgentNotifications.INCOMING_ORDER_CHANNEL_ID
                )
            }
            if (runCatching { startActivity(channelIntent) }.isSuccess) return
        }
        openAppDetails()
    }

    private fun testIncomingOrderAlert() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            startAfterNotificationPermission = false
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST
            )
            return
        }
        AgentNotifications.showTestAlert(this)
        Toast.makeText(this, getString(R.string.test_order_alert_sent), Toast.LENGTH_SHORT).show()
    }

    private fun openAppDetails() {
        startActivity(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:$packageName")
            )
        )
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
                    Toast.makeText(this@MainActivity, "Cổng nhận phiếu đang nhận kết nối", Toast.LENGTH_SHORT).show()
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
                AppLogger.s("CHẨN ĐOÁN", "2. Cổng nhận phiếu (${config.port}): Đang lắng nghe kết nối")
            } else {
                AppLogger.w("CHẨN ĐOÁN", "2. Cổng nhận phiếu (${config.port}): Không thể kết nối (Agent có thể đang dừng)")
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
        val resolvedCount = dbHelper.getResolvedCount()

        tvWaitingKpi.text = waitingCount.toString()
        tvSentKpi.text = resolvedCount.toString()
        renderOrderList()

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

    private fun showOrderDetail(order: OrderQueueDbHelper.QueuedOrder) {
        val timeFormat = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault())
        val rawBytes = runCatching { Base64.decode(order.rawBase64, Base64.DEFAULT) }
            .getOrDefault(byteArrayOf())
        val layers = ReceiptDataInspector.inspect(rawBytes, order.receiptText)
        val sourceRef = OrderIdentity.displaySourceOrderRef(order.platform, order.sourceOrderRef)
            ?: getString(R.string.receipt_internal_ref, order.id)
        var previewBitmap: Bitmap? = null

        val dialog = BottomSheetDialog(this)
        val sheetRoot = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(color(R.color.surface))
        }
        ViewCompat.setOnApplyWindowInsetsListener(sheetRoot) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, bars.top, 0, bars.bottom)
            insets
        }
        val sheetToolbar = MaterialToolbar(this).apply {
            title = sourceRef
            subtitle = "${platformLabel(order.platform)} · ${statusLabel(order.status)}"
            navigationIcon = ContextCompat.getDrawable(this@MainActivity, R.drawable.ic_close)
            navigationIcon?.setTint(color(R.color.ink))
            setNavigationContentDescription(R.string.close_action)
            setNavigationOnClickListener { dialog.dismiss() }
            setTitleTextColor(color(R.color.ink))
            setSubtitleTextColor(color(R.color.ink_muted))
        }
        sheetRoot.addView(sheetToolbar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val detailLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), dp(24))
        }

        val infoCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = roundedBackground(color(R.color.surface_muted), color(R.color.border), 10)
        }

        fun infoRow(label: String, value: String): LinearLayout {
            return LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dp(4), 0, dp(6))
                addView(TextView(this@MainActivity).apply {
                    text = label
                    textSize = 12f
                    setTextColor(color(R.color.ink_muted))
                })
                addView(TextView(this@MainActivity).apply {
                    text = value
                    textSize = 13.5f
                    setTextColor(color(R.color.ink))
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setPadding(0, dp(2), 0, 0)
                })
            }
        }

        infoCard.addView(infoRow(getString(R.string.receipt_status_label), statusLabel(order.status)))
        infoCard.addView(infoRow(getString(R.string.receipt_source_label), platformLabel(order.platform)))
        infoCard.addView(infoRow(
            getString(R.string.source_order_ref_label),
            OrderIdentity.displaySourceOrderRef(order.platform, order.sourceOrderRef)
                ?: getString(R.string.source_order_ref_missing)
        ))
        if (order.status == OrderQueueDbHelper.STATUS_SENT) {
            val posRef = OrderIdentity.displaySourceOrderRef(
                order.platform,
                order.posDisplayId ?: order.posOrderNumber
            ) ?: getString(R.string.pos_ref_missing_short)
            infoCard.addView(infoRow(getString(R.string.pos_receipt_ref_label), posRef))
            if (order.posOrderId != null || order.posOrderNumber != null) {
                infoCard.addView(
                    infoRow(
                        getString(R.string.reconciliation_result_label),
                        getString(
                            if (order.idempotent) R.string.reconciled_existing_pos
                            else R.string.created_on_pos
                        )
                    )
                )
            }
            if (order.sentAt > 0) {
                infoCard.addView(infoRow(
                    getString(R.string.sent_time_label),
                    timeFormat.format(Date(order.sentAt))
                ))
            }
        } else if (order.status == OrderQueueDbHelper.STATUS_DISMISSED) {
            infoCard.addView(infoRow(
                getString(R.string.resolution_label),
                order.resolutionNote ?: getString(R.string.manual_entry_resolution)
            ))
            if (order.resolvedAt > 0) {
                infoCard.addView(infoRow(
                    getString(R.string.resolved_time_label),
                    timeFormat.format(Date(order.resolvedAt))
                ))
            }
        }
        infoCard.addView(infoRow(
            getString(R.string.received_time_label),
            timeFormat.format(Date(order.createdAt))
        ))
        infoCard.addView(infoRow(getString(R.string.retry_count_label), order.retryCount.toString()))
        if (order.duplicateCount > 0) {
            infoCard.addView(infoRow(
                getString(R.string.duplicate_count_label),
                getString(R.string.duplicate_count_value, order.duplicateCount)
            ))
        }
        detailLayout.addView(infoCard)

        val operatorError = OperatorErrorFormatter.format(order.lastError)
        if (operatorError != null) {
            detailLayout.addView(space(12))
            val errorBox = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = roundedBackground(color(R.color.warning_surface), color(R.color.warning_border), 10)
                addView(TextView(this@MainActivity).apply {
                    text = getString(R.string.latest_error_title)
                    textSize = 12f
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(color(R.color.warning_text))
                })
                addView(TextView(this@MainActivity).apply {
                    text = operatorError
                    textSize = 12.5f
                    setTextColor(color(R.color.ink))
                    setPadding(0, dp(4), 0, 0)
                })
            }
            detailLayout.addView(errorBox)
        }

        detailLayout.addView(space(20))
        detailLayout.addView(sectionHeading(
            getString(R.string.receipt_data_title),
            getString(R.string.receipt_data_description)
        ))
        detailLayout.addView(space(10))
        detailLayout.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = roundedBackground(color(R.color.surface_muted), color(R.color.border), 12)
            addView(infoRow(getString(R.string.raw_data_label), formatByteCount(layers.rawByteCount)))
            addView(infoRow(getString(R.string.bitmap_data_label), layers.bitmapLabel))
            addView(infoRow(
                getString(R.string.text_data_label),
                getString(R.string.character_count, layers.textCharacterCount)
            ))
            addView(infoRow(
                getString(R.string.ocr_data_label),
                getString(R.string.character_count, layers.ocrCharacterCount)
            ))
        })
        detailLayout.addView(space(16))

        val dataTabs = TabLayout(this).apply {
            addTab(newTab().setText(R.string.receipt_bitmap_tab))
            addTab(newTab().setText(R.string.receipt_text_tab))
            addTab(newTab().setText(R.string.receipt_ocr_tab))
        }
        detailLayout.addView(dataTabs)
        detailLayout.addView(space(10))
        val dataContent = FrameLayout(this).apply {
            minimumHeight = dp(220)
        }
        detailLayout.addView(dataContent, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        fun renderLayer(position: Int) {
            dataContent.removeAllViews()
            val layer = when (position) {
                0 -> {
                    val raster = layers.raster
                    if (raster == null) {
                        receiptLayerEmpty(
                            getString(R.string.bitmap_empty_title),
                            getString(R.string.bitmap_empty_description)
                        )
                    } else {
                        if (previewBitmap == null || previewBitmap?.isRecycled == true) {
                            previewBitmap = raster.toPreviewBitmap()
                        }
                        LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            addView(TextView(this@MainActivity).apply {
                                text = getString(R.string.bitmap_preview_description, raster.width, raster.height)
                                textSize = 12.5f
                                setTextColor(color(R.color.ink_muted))
                                setPadding(dp(2), 0, dp(2), dp(10))
                            })
                            addView(ImageView(this@MainActivity).apply {
                                setImageBitmap(previewBitmap)
                                adjustViewBounds = true
                                scaleType = ImageView.ScaleType.FIT_CENTER
                                setBackgroundColor(Color.WHITE)
                                setPadding(dp(8), dp(8), dp(8), dp(8))
                                contentDescription = getString(R.string.bitmap_preview_content_description)
                            }, LinearLayout.LayoutParams(
                                LinearLayout.LayoutParams.MATCH_PARENT,
                                LinearLayout.LayoutParams.WRAP_CONTENT
                            ))
                        }
                    }
                }
                1 -> receiptTextLayer(
                    title = getString(R.string.receipt_text_layer_title),
                    description = getString(R.string.receipt_text_layer_description),
                    content = layers.printableText,
                    emptyTitle = getString(R.string.text_empty_title),
                    emptyDescription = getString(R.string.text_empty_description),
                    clipboardLabel = "Receipt text",
                    copiedMessage = getString(R.string.text_copied_toast)
                )
                else -> receiptTextLayer(
                    title = getString(R.string.receipt_ocr_layer_title),
                    description = getString(R.string.receipt_ocr_layer_description),
                    content = layers.ocrText,
                    emptyTitle = getString(R.string.ocr_empty_title),
                    emptyDescription = getString(R.string.ocr_empty_description),
                    clipboardLabel = "OCR Text",
                    copiedMessage = getString(R.string.ocr_copied_toast)
                )
            }
            dataContent.addView(layer, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ))
        }
        dataTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) = renderLayer(tab.position)
            override fun onTabUnselected(tab: TabLayout.Tab) = Unit
            override fun onTabReselected(tab: TabLayout.Tab) = Unit
        })
        renderLayer(0)

        val rootScroll = ScrollView(this).apply {
            isFillViewport = true
            addView(detailLayout)
        }
        sheetRoot.addView(rootScroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(10), dp(20), dp(16))
            setBackgroundColor(color(R.color.surface))
        }
        if (QueueLifecycle.canDismiss(order.status)) {
            actions.addView(secondaryButton(getString(R.string.mark_manual_entry_action)) {
                dialog.dismiss()
                promptDismissWaitingOrder(order)
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = dp(8)
                }
            })
        }
        if (
            order.status == OrderQueueDbHelper.STATUS_PENDING ||
            order.status == OrderQueueDbHelper.STATUS_BLOCKED
        ) {
            actions.addView(MaterialButton(this).apply {
                text = getString(R.string.retry_now_action)
                isAllCaps = false
                minHeight = dp(52)
                setOnClickListener {
                    dialog.dismiss()
                    if (dbHelper.retryOrderNow(order.id)) {
                        Toast.makeText(this@MainActivity, "Đã đưa phiếu $sourceRef lên đầu hàng chờ", Toast.LENGTH_SHORT).show()
                        refreshServiceState()
                    }
                }
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
        }
        if (actions.childCount > 0) {
            sheetRoot.addView(actions, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ))
        }

        dialog.setContentView(
            sheetRoot,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        dialog.setOnDismissListener {
            previewBitmap?.takeIf { !it.isRecycled }?.recycle()
            previewBitmap = null
        }
        dialog.setOnShowListener {
            dialog.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
                ?.let { bottomSheet ->
                    bottomSheet.layoutParams = bottomSheet.layoutParams.apply {
                        height = ViewGroup.LayoutParams.MATCH_PARENT
                    }
                    bottomSheet.requestLayout()
                }
            dialog.behavior.apply {
                state = BottomSheetBehavior.STATE_EXPANDED
                skipCollapsed = true
                isDraggable = true
            }
            ViewCompat.requestApplyInsets(sheetRoot)
        }
        dialog.show()
    }

    private fun receiptTextLayer(
        title: String,
        description: String,
        content: String?,
        emptyTitle: String,
        emptyDescription: String,
        clipboardLabel: String,
        copiedMessage: String
    ): View {
        if (content.isNullOrBlank()) return receiptLayerEmpty(emptyTitle, emptyDescription)
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    addView(TextView(this@MainActivity).apply {
                        text = title
                        textSize = 14f
                        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                        setTextColor(color(R.color.ink))
                    })
                    addView(TextView(this@MainActivity).apply {
                        text = description
                        textSize = 12f
                        setTextColor(color(R.color.ink_muted))
                        setPadding(0, dp(3), dp(8), 0)
                    })
                })
                addView(secondaryButton(getString(R.string.copy_action)) {
                    copyToClipboard(clipboardLabel, content, copiedMessage)
                }.apply {
                    minHeight = dp(48)
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                })
            })
            addView(space(10))
            addView(ScrollView(this@MainActivity).apply {
                isFillViewport = true
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = roundedBackground(color(R.color.console), color(R.color.console_border), 12)
                addView(TextView(this@MainActivity).apply {
                    text = content
                    textSize = 12f
                    typeface = Typeface.MONOSPACE
                    setTextColor(color(R.color.console_text))
                    setTextIsSelectable(true)
                    setLineSpacing(dp(3).toFloat(), 1.05f)
                })
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(260)
            ))
        }
    }

    private fun receiptLayerEmpty(title: String, description: String): View =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            minimumHeight = dp(220)
            setPadding(dp(24), dp(32), dp(24), dp(32))
            background = roundedBackground(color(R.color.surface_muted), color(R.color.border), 16)
            addView(TextView(this@MainActivity).apply {
                text = title
                textSize = 15f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setTextColor(color(R.color.ink))
                gravity = Gravity.CENTER
            })
            addView(TextView(this@MainActivity).apply {
                text = description
                textSize = 12.5f
                setTextColor(color(R.color.ink_muted))
                gravity = Gravity.CENTER
                setPadding(0, dp(6), 0, 0)
            })
        }

    private fun EscPosRaster.toPreviewBitmap(): Bitmap {
        val pixels = IntArray(blackPixels.size) { index ->
            if (blackPixels[index].toInt() == 1) Color.BLACK else Color.WHITE
        }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    private fun formatByteCount(byteCount: Int): String = when {
        byteCount < 1024 -> "$byteCount B"
        else -> String.format(Locale.getDefault(), "%.1f KB", byteCount / 1024.0)
    }

    private fun promptDismissWaitingOrder(order: OrderQueueDbHelper.QueuedOrder) {
        val sourceRef = OrderIdentity.displaySourceOrderRef(order.platform, order.sourceOrderRef)
            ?: "phiếu #${order.id}"
        MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.mark_manual_entry_action))
            .setMessage(getString(R.string.mark_manual_entry_confirm, sourceRef))
            .setPositiveButton(getString(R.string.mark_manual_entry_action)) { _, _ ->
                if (dbHelper.dismissWaitingOrder(order.id, QueueLifecycle.MANUAL_ENTRY_RESOLUTION)) {
                    Toast.makeText(this, getString(R.string.mark_manual_entry_success, sourceRef), Toast.LENGTH_SHORT).show()
                    refreshServiceState()
                }
            }
            .setNegativeButton("Hủy", null)
            .show()
    }

    private fun statusLabel(status: String): String = when (status) {
        OrderQueueDbHelper.STATUS_SENT -> "Đã xuất lên POS"
        OrderQueueDbHelper.STATUS_SENDING -> "Đang gửi"
        OrderQueueDbHelper.STATUS_BLOCKED -> "Cần xử lý"
        OrderQueueDbHelper.STATUS_UNCLASSIFIED -> "Cần kiểm tra"
        OrderQueueDbHelper.STATUS_DISMISSED -> "Thu ngân đã nhập tay"
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
            tvLogs.text = getString(R.string.logs_empty_state)
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
            scrollLogs.scrollTo(0, (tvLogs.height - scrollLogs.height).coerceAtLeast(0))
        }
    }
}
