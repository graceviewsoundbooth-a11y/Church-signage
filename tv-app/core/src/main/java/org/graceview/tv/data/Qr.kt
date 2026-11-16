package org.graceview.tv.data

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

object Qr {
    fun wifiPayload(ssid: String, password: String) = "WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;"

    private fun esc(s: String) = buildString {
        for (ch in s) {
            if (ch in "\\;,:\"") append('\\')
            append(ch)
        }
    }

    /**
     * The code's modules, one ARGB pixel each (black or white), row by row, with no margin.
     * Each app turns it into an image and draws it scaled up with nearest-neighbor filtering.
     */
    fun pixels(text: String): Pixels {
        val hints = mapOf<EncodeHintType, Any>(
            EncodeHintType.MARGIN to 0,
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        )
        val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints)
        val px = IntArray(m.width * m.height)
        for (y in 0 until m.height) for (x in 0 until m.width) {
            px[y * m.width + x] = if (m.get(x, y)) BLACK else WHITE
        }
        return Pixels(m.width, m.height, px)
    }

    class Pixels(val width: Int, val height: Int, val argb: IntArray)

    private const val BLACK = 0xFF000000.toInt()
    private const val WHITE = 0xFFFFFFFF.toInt()
}
