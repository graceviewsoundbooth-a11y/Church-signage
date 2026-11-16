package org.graceview.tv.desktop.ui

// Ported from the TV app's ui/SignageScreen.kt (design/Lobby-Signage, CoffeeSpot-School). Keep the two in step.

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import kotlinx.coroutines.delay
import org.graceview.tv.Config
import org.graceview.tv.data.CalEvent
import org.graceview.tv.data.Qr
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
import org.graceview.tv.data.Weather
import org.graceview.tv.desktop.Clock
import java.io.File
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Signage mode: slides top-left, sidebar right, bottom bar. */
@Composable
fun SignageScreen(
    theme: Theme,
    folderName: String,
    folderLinked: Boolean,
    slides: List<Slide>,
    events: List<CalEvent>?,
    weather: Weather?,
    logoDark: File?,
    logoLight: File?,
) {
    val main = Color(theme.main)
    Column(Modifier.fillMaxSize().background(main)) {
        Row(Modifier.fillMaxWidth().height(u(864))) {
            Box(Modifier.width(u(1536)).fillMaxHeight().background(main)) {
                SlideArea(slides, main, theme.displayName, emptyHint(folderName, folderLinked))
            }
            Sidebar(theme, events, main)
        }
        BottomBar(theme, weather, logoDark, logoLight)
    }
}

fun emptyHint(folder: String, linked: Boolean) =
    if (!linked) "The \"$folder\" folder has no Drive link in the Folders tab."
    else "Add JPG, PNG or MP4 files to the \"$folder\" Drive folder."

// ---- Slides --------------------------------------------------------------

@Composable
fun SlideArea(slides: List<Slide>, bg: Color, title: String, hint: String, showDots: Boolean = true, dotsBottom: Int = 28) {
    if (slides.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(u(96)), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            T(title, 72, weight = FontWeight.Bold, family = Montserrat, align = TextAlign.Center)
            Spacer(Modifier.height(u(24)))
            T(hint, 30, color = Color.White.copy(alpha = 0.8f), align = TextAlign.Center)
        }
        return
    }

    var counter by remember { mutableIntStateOf(0) }
    val i = counter % slides.size
    val slide = slides[i]
    val next: () -> Unit = { counter++ }

    key(slide.file.path, counter) {
        // At most 12 seconds each; a "[full]" video up to 3 minutes. A video that ends sooner advances early.
        LaunchedEffect(Unit) {
            delay(Config.slideMaxMs(slide.name, slide.video))
            next()
        }
        if (slide.video) {
            VlcVideo(slide.file.absolutePath, bg, muted = true, live = false, onEnded = next)
        } else {
            FileImage(slide.file, Modifier.fillMaxSize())
        }
    }

    if (showDots && slides.size in 2..20) {
        Row(
            Modifier.fillMaxSize().padding(bottom = u(dotsBottom)),
            horizontalArrangement = Arrangement.spacedBy(u(12), Alignment.CenterHorizontally),
            verticalAlignment = Alignment.Bottom,
        ) {
            slides.indices.forEach { n ->
                Box(
                    Modifier
                        .size(width = u(if (n == i) 36 else 12), height = u(12))
                        .background(if (n == i) Color.White else Color.White.copy(alpha = 0.5f), RoundedCornerShape(u(6))),
                )
            }
        }
    }
}

// ---- Sidebar -------------------------------------------------------------

private fun sidebarTitle(t: Theme) = if (t.displayName.contains("School", true)) "This Week at School" else "This Week"

private fun infoLabel(t: Theme) = when {
    t.displayName.contains("School", true) -> "School Info"
    t.displayName.contains("Church", true) -> "Church Info"
    else -> "More Info"
}

@Composable
private fun Sidebar(theme: Theme, events: List<CalEvent>?, bg: Color) {
    val wifi = if (theme.wifiName.isNotBlank() && theme.wifiPassword.isNotBlank()) Qr.wifiPayload(theme.wifiName, theme.wifiPassword) else null
    val info = theme.qrLink.ifBlank { null }
    val qrCount = listOfNotNull(wifi, info).size

    Column(
        Modifier.width(u(384)).fillMaxHeight().background(bg).padding(start = u(40), end = u(40), top = u(52), bottom = u(44)),
        verticalArrangement = Arrangement.spacedBy(u(30)),
    ) {
        if (events != null) {
            Column {
                T(sidebarTitle(theme), 36, weight = FontWeight.Bold, family = Montserrat, lineHeight = 1.2f)
                Spacer(Modifier.height(u(18)))
                Box(Modifier.fillMaxWidth().height(u(2)).background(Color.White.copy(alpha = 0.6f)))
            }
            FitColumn(Modifier.weight(1f).fillMaxWidth(), u(30)) {
                if (events.isEmpty()) {
                    T(Config.NO_EVENTS_TEXT, 30, lineHeight = 1.2f)
                } else {
                    events.take(if (qrCount == 0) 4 else 3).forEach { ev ->
                        Column(verticalArrangement = Arrangement.spacedBy(u(4))) {
                            T(ev.label().uppercase(Locale.US), 22, weight = FontWeight.SemiBold, letterSpacingEm = 0.1f, maxLines = 2, lineHeight = 1.2f)
                            T(ev.title, 32, lineHeight = 1.15f, maxLines = 2)
                        }
                    }
                }
            }
        } else {
            Spacer(Modifier.weight(1f))
        }
        when {
            wifi != null && info != null -> Column(verticalArrangement = Arrangement.spacedBy(u(18))) {
                Row(horizontalArrangement = Arrangement.spacedBy(u(24))) {
                    QrTile(info, infoLabel(theme))
                    QrTile(wifi, "Free Wi-Fi")
                }
                T("Point your phone camera at a code", 20, lineHeight = 1.3f)
            }
            wifi != null -> QrRow(wifi, "Free Wi-Fi", "Scan to join ${theme.wifiName}")
            info != null -> QrRow(info, infoLabel(theme), "Scan with your phone camera")
        }
    }
}

/** A column that places its children top to bottom and leaves out any child that wouldn't fit whole. */
@Composable
private fun FitColumn(modifier: Modifier, spacing: Dp, content: @Composable () -> Unit) {
    Layout(content, modifier) { measurables, c ->
        val gap = spacing.roundToPx()
        val child = Constraints(maxWidth = c.maxWidth)
        val placed = mutableListOf<Placeable>()
        var used = 0
        for (m in measurables) {
            val p = m.measure(child)
            val top = if (placed.isEmpty()) 0 else used + gap
            if (top + p.height > c.maxHeight) break
            placed += p
            used = top + p.height
        }
        layout(c.maxWidth, if (c.hasBoundedHeight) c.maxHeight else used) {
            var y = 0
            placed.forEachIndexed { i, p ->
                if (i > 0) y += gap
                p.placeRelative(0, y)
                y += p.height
            }
        }
    }
}

/** The code drawn module by module, so it stays sharp at any size. */
@Composable
private fun QrImage(text: String, size: Int) {
    val px = remember(text) { runCatching { Qr.pixels(text) }.getOrNull() } ?: return
    Box(Modifier.size(u(size + 16)).background(Color.White).padding(u(8))) {
        Canvas(Modifier.fillMaxSize()) {
            val cell = this.size.width / px.width
            for (y in 0 until px.height) for (x in 0 until px.width) {
                if (px.argb[y * px.width + x] == 0xFF000000.toInt()) {
                    drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.5f, cell + 0.5f))
                }
            }
        }
    }
}

@Composable
private fun QrTile(text: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(u(10))) {
        QrImage(text, 124)
        T(label, 22, weight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun QrRow(text: String, title: String, sub: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(20))) {
        QrImage(text, 140)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(u(4))) {
            T(title, 30, weight = FontWeight.SemiBold, lineHeight = 1.15f)
            T(sub, 22, lineHeight = 1.3f, maxLines = 4)
        }
    }
}

// ---- Bottom bar ----------------------------------------------------------

private val TIME = DateTimeFormatter.ofPattern("h:mm", Locale.US)
private val AMPM = DateTimeFormatter.ofPattern("a", Locale.US)
private val DOW = DateTimeFormatter.ofPattern("EEE", Locale.US)
private val DD = DateTimeFormatter.ofPattern("dd", Locale.US)
private val MONTH = DateTimeFormatter.ofPattern("MMMM", Locale.US)

@Composable
fun rememberNow(): State<ZonedDateTime> {
    val now = remember { mutableStateOf(Clock.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            now.value = Clock.now()
            delay(1000 - System.currentTimeMillis() % 1000)
        }
    }
    return now
}

@Composable
private fun BottomBar(theme: Theme, weather: Weather?, logoDark: File?, logoLight: File?) {
    val main = Color(theme.main)
    val accent = Color(theme.accent)
    val now by rememberNow()
    val temp = weather?.let { "${it.tempF}°" } ?: "--°"

    Row(Modifier.fillMaxWidth().height(u(216))) {
        if (theme.wayLeft.isNotEmpty() || theme.wayRight.isNotEmpty()) {
            Cell(384, accent) { Clock(now) }
            Cell(384, main) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(20))) {
                    T(now.format(DOW), 96, weight = FontWeight.Light, lineHeight = 1f)
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        T(now.format(DD), 116, weight = FontWeight.Light, lineHeight = 1f)
                        T(now.format(MONTH), 26)
                    }
                }
            }
            Cell(384, accent, center = false) { Wayfinding(theme.wayLeft, left = true) }
            Cell(384, main, center = false) { Wayfinding(theme.wayRight, left = false) }
            Cell(384, accent) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(u(18))) {
                    Logo(logoDark ?: logoLight, theme.displayName, width = 250, maxHeight = 100, textColor = Color.White)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(12))) {
                        WeatherIcon(weather, 52, 36)
                        T("$temp ${Config.WEATHER_PLACE}", 34, weight = FontWeight.Light, maxLines = 1)
                    }
                }
            }
        } else {
            // No wayfinding (the Coffee Spot layout): clock, big weather, logo on white, wide date.
            Cell(384, accent) { Clock(now) }
            Cell(480, main) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(u(4))) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(20))) {
                        WeatherIcon(weather, 120, 84)
                        T(temp, 110, weight = FontWeight.Light, lineHeight = 1f)
                    }
                    T(Config.WEATHER_PLACE, 26)
                }
            }
            Cell(216, Color.White) { Logo(logoLight ?: logoDark, theme.displayName, width = 180, maxHeight = 180, textColor = main) }
            Cell(840, main) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(24))) {
                    Column(horizontalAlignment = Alignment.End) {
                        T(now.format(DOW), 96, weight = FontWeight.Light, lineHeight = 1f)
                        T(now.format(MONTH), 30)
                    }
                    T(now.format(DD), 120, weight = FontWeight.Light, lineHeight = 1f)
                }
            }
        }
    }
}

@Composable
private fun Cell(width: Int, bg: Color, center: Boolean = true, content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier.width(u(width)).fillMaxHeight().background(bg),
        contentAlignment = if (center) Alignment.Center else Alignment.CenterStart,
        content = content,
    )
}

@Composable
private fun Clock(now: ZonedDateTime) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(14))) {
        T(now.format(TIME), 116, weight = FontWeight.Light, lineHeight = 1f)
        T(now.format(AMPM), 42, weight = FontWeight.Light, lineHeight = 1f, modifier = Modifier.padding(top = u(24)))
    }
}

@Composable
private fun Wayfinding(items: List<String>, left: Boolean) {
    Column(Modifier.padding(horizontal = u(30)), verticalArrangement = Arrangement.spacedBy(u(4))) {
        items.take(4).forEach { T(if (left) "← $it" else "$it →", 34, maxLines = 1) }
    }
}

@Composable
fun Logo(file: File?, name: String, width: Int, maxHeight: Int, textColor: Color) {
    if (file != null) {
        FileImage(file, Modifier.width(u(width)).heightIn(max = u(maxHeight)))
    } else {
        T(name, 26, modifier = Modifier.width(u(width)), weight = FontWeight.SemiBold, color = textColor, align = TextAlign.Center, lineHeight = 1.15f)
    }
}

// ---- Weather icon (the designs' 64x44 viewBox, white outline) -------------

private val cloudPath: Path = PathParser().parsePathString("M17 40h31a11 11 0 0 0 1-22 16 16 0 0 0-30-5A13.5 13.5 0 0 0 17 40z").toPath()

private enum class Sky { Sun, Moon, Cloud, Fog, Rain, Snow, Storm }

private fun sky(w: Weather?): Sky = when (w?.code) {
    null -> Sky.Cloud
    0, 1 -> if (w?.isDay != false) Sky.Sun else Sky.Moon
    2, 3 -> Sky.Cloud
    45, 48 -> Sky.Fog
    in 51..67, in 80..82 -> Sky.Rain
    in 71..77, 85, 86 -> Sky.Snow
    in 95..99 -> Sky.Storm
    else -> Sky.Cloud
}

@Composable
private fun WeatherIcon(weather: Weather?, w: Int, h: Int) {
    val kind = sky(weather)
    Canvas(Modifier.size(u(w), u(h))) {
        val s = size.width / 64f
        scale(s, s, pivot = Offset.Zero) { drawSky(kind) }
    }
}

private fun DrawScope.drawSky(kind: Sky) {
    val white = Color.White
    val line = Stroke(width = 3.5f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    fun smallCloud() = translate(10f, -3f) {
        scale(0.7f, 0.7f, pivot = Offset.Zero) { drawPath(cloudPath, white, style = Stroke(5f, join = StrokeJoin.Round)) }
    }
    when (kind) {
        Sky.Sun -> {
            drawCircle(white, radius = 8f, center = Offset(32f, 22f), style = line)
            for (k in 0 until 8) {
                val a = Math.toRadians(k * 45.0)
                val dx = Math.cos(a).toFloat()
                val dy = Math.sin(a).toFloat()
                drawLine(white, Offset(32f + dx * 13f, 22f + dy * 13f), Offset(32f + dx * 18f, 22f + dy * 18f), 3.5f, StrokeCap.Round)
            }
        }
        Sky.Moon -> {
            val a = Path().apply { addOval(Rect(Offset(32f, 22f), 15f)) }
            val b = Path().apply { addOval(Rect(Offset(41f, 15f), 12f)) }
            val m = Path().apply { op(a, b, PathOperation.Difference) }
            drawPath(m, white, style = line)
        }
        Sky.Cloud -> drawPath(cloudPath, white, style = line)
        Sky.Fog -> {
            smallCloud()
            for (y in listOf(34f, 41f)) drawLine(white, Offset(14f, y), Offset(50f, y), 3.5f, StrokeCap.Round)
        }
        Sky.Rain -> {
            smallCloud()
            for (x in listOf(24f, 33f, 42f)) drawLine(white, Offset(x, 33f), Offset(x - 3f, 42f), 3.5f, StrokeCap.Round)
        }
        Sky.Snow -> {
            smallCloud()
            for (x in listOf(24f, 33f, 42f)) drawCircle(white, radius = 2.4f, center = Offset(x, 38f))
        }
        Sky.Storm -> {
            smallCloud()
            val bolt = Path().apply {
                moveTo(35f, 29f); lineTo(28f, 37f); lineTo(33f, 37f); lineTo(29f, 44f); lineTo(38f, 34f); lineTo(33f, 34f); close()
            }
            drawPath(bolt, white)
        }
    }
}
