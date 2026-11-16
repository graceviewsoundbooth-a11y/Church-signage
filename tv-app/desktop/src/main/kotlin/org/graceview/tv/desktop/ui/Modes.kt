package org.graceview.tv.desktop.ui

// Ported from the TV app's ui/ModeScreens.kt (design/Lobby-Countdown, Lobby-Live, Special-Override). Keep the two in step.

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import org.graceview.tv.data.Device
import org.graceview.tv.data.LiveFeed
import org.graceview.tv.data.ScheduleState
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
import org.graceview.tv.desktop.DesktopLog
import java.io.File
import java.time.Duration
import java.time.format.DateTimeFormatter
import java.util.Locale

private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
private val LONG_DATE = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.US)

/** Fullscreen mode: announcement rotation only. */
@Composable
fun FullscreenScreen(theme: Theme, slides: List<Slide>, hint: String) {
    Box(Modifier.fillMaxSize().background(Color(theme.main))) {
        SlideArea(slides, Color(theme.main), theme.displayName, hint)
    }
}

/** Countdown mode: full-screen slides and a bar counting down to the row's End time. */
@Composable
fun CountdownScreen(theme: Theme, state: ScheduleState, slides: List<Slide>, hint: String, logo: File?) {
    val now by rememberNow()
    val end = state.end
    val left = if (end == null) Duration.ZERO else Duration.between(now, end).let { if (it.isNegative) Duration.ZERO else it }
    val secs = left.seconds
    val text = if (secs >= 3600) "%d:%02d:%02d".format(secs / 3600, (secs % 3600) / 60, secs % 60) else "%d:%02d".format(secs / 60, secs % 60)

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Box(Modifier.fillMaxWidth().height(u(880))) {
            SlideArea(slides, Color.Black, theme.displayName, hint, dotsBottom = 20)
        }
        Row(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().height(u(200)).background(Color(theme.accent)).padding(horizontal = u(96)),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(32))) {
                T("Worship begins in", 48, weight = FontWeight.SemiBold)
                T(text, 136, weight = FontWeight.Bold, family = Montserrat, lineHeight = 1f)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(36))) {
                if (end != null) {
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(u(2))) {
                        T("Sanctuary · ${end.format(CLOCK)}", 42, weight = FontWeight.SemiBold)
                        T(end.format(LONG_DATE), 30)
                    }
                }
                Logo(logo, theme.displayName, width = 280, maxHeight = 140, textColor = Color.White)
            }
        }
    }
}

/** Message mode: full-screen text from Override Now B9. */
@Composable
fun MessageScreen(theme: Theme, message: String, logo: File?) {
    val now by rememberNow()
    val amber = Color(0xFFF2A900)
    val textSize = when {
        message.length > 140 -> 72
        message.length > 80 -> 96
        else -> 120
    }
    Column(Modifier.fillMaxSize().background(Color(0xFF14171C))) {
        Box(Modifier.fillMaxWidth().height(u(28)).background(amber))
        Column(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = u(160), vertical = u(100)),
            verticalArrangement = Arrangement.spacedBy(u(40), Alignment.CenterVertically),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(24))) {
                Canvas(Modifier.size(u(84))) {
                    val s = size.width / 48f
                    scale(s, s, pivot = Offset.Zero) {
                        val tri = Path().apply { moveTo(24f, 5f); lineTo(44f, 41f); lineTo(4f, 41f); close() }
                        drawPath(tri, amber, style = Stroke(4f, join = StrokeJoin.Round))
                        drawLine(amber, Offset(24f, 19f), Offset(24f, 29f), 4f, StrokeCap.Round)
                        drawLine(amber, Offset(24f, 35f), Offset(24f, 36f), 4f, StrokeCap.Round)
                    }
                }
                T("IMPORTANT UPDATE", 48, weight = FontWeight.ExtraBold, family = Montserrat, color = amber, letterSpacingEm = 0.08f)
            }
            T(message.ifBlank { " " }, textSize, weight = FontWeight.ExtraBold, family = Montserrat, lineHeight = 1.08f)
            T("Watch graceview.org and your email for updates.", 50, color = Color(0xFFD6D9DF))
        }
        Row(
            Modifier.fillMaxWidth().height(u(150)).border(u(1), Color(0xFF2E333C)).padding(horizontal = u(160)),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Logo(logo, theme.displayName, width = 240, maxHeight = 110, textColor = Color.White)
            T(now.format(CLOCK), 48, weight = FontWeight.Light)
        }
    }
}

/** Live mode (design/Lobby-Live): the local stream in the video area, a bar below. */
@Composable
fun LiveScreen(theme: Theme, state: ScheduleState?, feed: LiveFeed?, logo: File?, muted: Boolean) {
    val now by rememberNow()
    Column(Modifier.fillMaxSize().background(Color(0xFF0B0C0F))) {
        Box(Modifier.fillMaxWidth().height(u(940)).background(Color(0xFF16181D)), contentAlignment = Alignment.Center) {
            when {
                feed == null -> LivePlaceholder("No Local stream row in the Live Feeds tab.")
                !Vlc.available -> LivePlaceholder("The live feed needs VLC, which wasn't found.")
                else -> LivePlayer(feed.address, muted)
            }
        }
        Row(
            Modifier.fillMaxWidth().height(u(140)).background(Color(theme.accent)).padding(horizontal = u(72)),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(28))) {
                Row(
                    Modifier.background(Color.White, RoundedCornerShape(u(8))).padding(horizontal = u(22), vertical = u(10)),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(u(12)),
                ) {
                    Box(Modifier.size(u(16)).background(Color(theme.accent), RoundedCornerShape(u(8))))
                    T("LIVE", 34, weight = FontWeight.ExtraBold, family = Montserrat, color = Color(theme.accent), letterSpacingEm = 0.08f)
                }
                T(liveTitle(state), 44, weight = FontWeight.SemiBold, maxLines = 1)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(36))) {
                T(now.format(CLOCK), 52, weight = FontWeight.Light)
                Logo(logo, theme.displayName, width = 230, maxHeight = 100, textColor = Color.White)
            }
        }
    }
}

private fun liveTitle(state: ScheduleState?): String {
    val note = state?.note.orEmpty()
    return if (note.isBlank() || note.equals("Sunday service", true)) "Worship from the Sanctuary" else note
}

@Composable
private fun LivePlaceholder(text: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(u(28))) {
        Canvas(Modifier.size(u(180), u(120))) {
            val s = size.width / 120f
            scale(s, s, pivot = Offset.Zero) {
                val grey = Color(0xFF8A8F9C)
                drawRoundRect(grey, topLeft = Offset(4f, 4f), size = Size(112f, 72f), cornerRadius = CornerRadius(6f), style = Stroke(3f))
                drawPath(Path().apply { moveTo(50f, 26f); lineTo(76f, 40f); lineTo(50f, 54f); close() }, grey, style = Stroke(3f, join = StrokeJoin.Round))
            }
        }
        T(text, 44, color = Color(0xFFB8BCC6), align = TextAlign.Center)
    }
}

/**
 * The sanctuary stream (vMix → MediaMTX, RTSP over TCP). Like the TVs: a "Connecting" cover until
 * the first frame, a retry 5 seconds after an error or end, and a reconnect when no new frame has
 * arrived for 10 seconds (a stopped stream can leave the last frame frozen).
 */
@Composable
fun LivePlayer(address: String, muted: Boolean) {
    val pb = remember(address, muted) { VlcPlayback(address, live = true, muted = muted) }
    val frames by pb.sink.frames.collectAsState()
    val framesAtStart = remember(pb) { mutableLongStateOf(0L) }

    androidx.compose.runtime.DisposableEffect(pb) {
        pb.play()
        onDispose { pb.release() }
    }
    LaunchedEffect(pb) {
        pb.ended.collect {
            DesktopLog.i("Live", "Live stream ended or failed; retrying in 5 s")
            framesAtStart.longValue = pb.sink.frames.value
            delay(5_000)
            pb.restart()
        }
    }
    LaunchedEffect(pb) {
        var last = -1L
        var stuckSince = System.currentTimeMillis()
        while (true) {
            delay(2_000)
            val f = pb.sink.frames.value
            val now = System.currentTimeMillis()
            if (f != last) { last = f; stuckSince = now }
            else if (now - stuckSince >= 10_000) {
                DesktopLog.i("Live", "Live stream stalled for 10 s; reconnecting")
                framesAtStart.longValue = f
                pb.restart()
                stuckSince = now
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        VideoSurface(pb.sink, Color.Black)
        if (frames <= framesAtStart.longValue) {
            Box(Modifier.fillMaxSize().background(Color(0xFF1F242C)), contentAlignment = Alignment.Center) {
                T("Connecting to the sanctuary feed…", 30, color = Color(0xFFAAB2BD))
            }
        }
    }
}

@Composable
fun BlackScreen() {
    Box(Modifier.fillMaxSize().background(Color.Black))
}

/** A note at the bottom of the screen (keyboard shortcuts, "Press Esc again"). */
@Composable
fun BottomBanner(text: String) {
    Box(Modifier.fillMaxSize().padding(bottom = u(80)), contentAlignment = Alignment.BottomCenter) {
        Box(
            Modifier
                .background(Color(0xEB14171C), RoundedCornerShape(u(24)))
                .border(u(4), Color.White, RoundedCornerShape(u(24)))
                .padding(horizontal = u(56), vertical = u(32)),
        ) {
            T(text, 40, weight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun StatusScreen(title: String, detail: String) {
    Column(Modifier.fillMaxSize().background(Color(0xFF111418)).padding(u(120)), verticalArrangement = Arrangement.Center) {
        T(title, 64, weight = FontWeight.Bold, family = Montserrat)
        Spacer(Modifier.height(u(24)))
        T(detail, 32, color = Color(0xFFCCCCCC), lineHeight = 1.35f)
    }
}

/** First start (or Ctrl+D): which device is this PC? Mouse or arrow keys and Enter. */
@Composable
fun DevicePicker(all: List<Device>, current: String?, onPick: (String) -> Unit) {
    // The Event Screen row first: it's the usual choice, and the list can be longer than the screen.
    val devices = all.sortedBy { if (it.name.equals("Event Screen", ignoreCase = true)) 0 else 1 }
    val first = remember { FocusRequester() }
    // Start on the current name, or on the Event Screen row.
    val focusIndex = devices.indexOfFirst { it.name.equals(current ?: "Event Screen", ignoreCase = true) }.coerceAtLeast(0)
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    Column(
        Modifier.fillMaxSize().background(Color(0xFF111418)).padding(horizontal = u(160), vertical = u(96))
            .onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (e.key) {
                    Key.DirectionDown -> focusManager.moveFocus(FocusDirection.Down)
                    Key.DirectionUp -> focusManager.moveFocus(FocusDirection.Up)
                    else -> false
                }
            },
    ) {
        T("Which screen is this?", 64, weight = FontWeight.Bold, family = Montserrat)
        Spacer(Modifier.height(u(16)))
        T("Click one, or use the arrow keys and Enter. Change it later with Ctrl+D.", 30, color = Color(0xFFCCCCCC))
        Spacer(Modifier.height(u(48)))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(u(16))) {
            itemsIndexed(devices) { i, d ->
                PickerItem(d, d.name.equals(current, ignoreCase = true), if (i == focusIndex) first else null) { onPick(d.name) }
            }
        }
    }
    LaunchedEffect(devices) { runCatching { first.requestFocus() } }
}

@Composable
private fun PickerItem(d: Device, selected: Boolean, focus: FocusRequester?, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val hovered by src.collectIsHoveredAsState()
    val shape = RoundedCornerShape(u(12))
    Column(
        Modifier
            .fillMaxWidth()
            .then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
            .border(u(4), if (focused || hovered) Color.White else Color.Transparent, shape)
            .background(if (focused || hovered) Color(0xFF2B3440) else Color(0xFF1B2028), shape)
            .hoverable(src)
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(horizontal = u(32), vertical = u(20)),
        verticalArrangement = Arrangement.spacedBy(u(6)),
    ) {
        T(d.name + if (selected) "  (current)" else "", 40, weight = FontWeight.SemiBold)
        T(listOf(d.profile, d.location).filter { it.isNotBlank() }.joinToString(" · "), 26, color = Color(0xFFBBBBBB))
    }
}
