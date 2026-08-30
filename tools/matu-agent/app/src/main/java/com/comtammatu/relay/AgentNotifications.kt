package com.comtammatu.relay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

@Suppress("DEPRECATION")
object AgentNotifications {
    const val SERVICE_CHANNEL_ID = "comtammatu_pos_bridge_channel"
    const val INCOMING_ORDER_CHANNEL_ID = "comtammatu_incoming_orders_v1"
    const val SERVICE_NOTIFICATION_ID = 1001
    private const val INCOMING_NOTIFICATION_BASE_ID = 2000

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val serviceChannel = NotificationChannel(
            SERVICE_CHANNEL_ID,
            "Má Tư Agent đang chạy",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Thông báo thường trực khi Agent đang nhận phiếu"
            setShowBadge(false)
        }
        val orderChannel = NotificationChannel(
            INCOMING_ORDER_CHANNEL_ID,
            "Đơn mới",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Cảnh báo nổi, âm thanh và rung khi Má Tư Agent nhận đơn mới"
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannels(listOf(serviceChannel, orderChannel))
    }

    fun buildServiceNotification(context: Context, statusText: String): Notification {
        ensureChannels(context)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, SERVICE_CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }
        return builder
            .setContentTitle("Má Tư Agent đang nhận đơn")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_agenda)
            .setContentIntent(openAgentIntent(context, SERVICE_NOTIFICATION_ID))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(Notification.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .build()
    }

    fun showIncomingOrder(
        context: Context,
        platform: DeliveryPlatform,
        sourceOrderRef: String?,
        queueId: Long
    ) {
        ensureChannels(context)
        val displayRef = OrderIdentity.displaySourceOrderRef(platform.wireValue, sourceOrderRef)
        val copy = IncomingOrderAlertTextBuilder.build(platform.displayName, displayRef, queueId)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notificationId = INCOMING_NOTIFICATION_BASE_ID + (queueId % 100_000).toInt()
        manager.notify(
            notificationId,
            buildOrderAlert(context, copy.title, copy.body, queueId.toInt())
        )
    }

    fun showTestAlert(context: Context) {
        ensureChannels(context)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(
            INCOMING_NOTIFICATION_BASE_ID - 1,
            buildOrderAlert(
                context,
                "Kiểm tra cảnh báo đơn mới",
                "Má Tư Agent có thể hiện thông báo nổi khi ứng dụng khác đang mở.",
                INCOMING_NOTIFICATION_BASE_ID - 1
            )
        )
    }

    private fun buildOrderAlert(
        context: Context,
        title: String,
        body: String,
        requestCode: Int
    ): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, INCOMING_ORDER_CHANNEL_ID)
        } else {
            Notification.Builder(context)
        }
        return builder
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentIntent(openAgentIntent(context, requestCode))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setPriority(Notification.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .build()
    }

    private fun openAgentIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val immutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE
        } else {
            0
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag
        )
    }
}
