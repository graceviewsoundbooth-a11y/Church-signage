package org.graceview.tv.ui

import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import org.graceview.tv.data.Qr

/** One pixel per module; draw it scaled up with nearest-neighbor filtering. */
fun Qr.bitmap(text: String): ImageBitmap {
    val p = pixels(text)
    return Bitmap.createBitmap(p.argb, p.width, p.height, Bitmap.Config.ARGB_8888).asImageBitmap()
}
