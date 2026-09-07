package com.comtammatu.relay

import android.graphics.Bitmap
import android.graphics.Color

object ReceiptOcrBitmaps {
    fun toArgb(prepared: PreparedRaster): Bitmap {
        val colors = IntArray(prepared.blackPixels.size) { index ->
            if (prepared.blackPixels[index].toInt() == 1) Color.BLACK else Color.WHITE
        }
        return Bitmap.createBitmap(colors, prepared.width, prepared.height, Bitmap.Config.ARGB_8888)
    }
}
