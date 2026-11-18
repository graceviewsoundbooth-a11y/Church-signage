package org.graceview.tv.ui

import org.graceview.tv.Config
import android.net.Uri
import android.view.LayoutInflater
import androidx.annotation.OptIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import org.graceview.tv.R
import org.graceview.tv.data.LiveFeed
import org.graceview.tv.data.ScheduleState
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
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

/** Countdown mode (design/Lobby-Countdown): full-screen slides and a bar counting down to the row's End time. */
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

/** Message mode (design/Special-Override): full-screen text from Override Now B9. */
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
            if (Config.MESSAGE_LINE.isNotBlank()) T(Config.MESSAGE_LINE, 50, color = Color(0xFFD6D9DF))
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

/**
 * Live mode (design/Lobby-Live). A local stream plays in the video area. For YouTube, the
 * YouTube app opens on top; this screen is what shows behind it or if YouTube can't open.
 */
@Composable
fun LiveScreen(theme: Theme, state: ScheduleState?, feed: LiveFeed?, logo: File?, muted: Boolean = false) {
    val now by rememberNow()
    Column(Modifier.fillMaxSize().background(Color(0xFF0B0C0F))) {
        Box(Modifier.fillMaxWidth().height(u(940)).background(Color(0xFF16181D)), contentAlignment = Alignment.Center) {
            when {
                feed == null -> LivePlaceholder("No live feed is checked Active in the Live Feeds tab.")
                feed.isYouTube -> LivePlaceholder("Opening the live service on YouTube…")
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
                drawRoundRect(grey, topLeft = Offset(4f, 4f), size = androidx.compose.ui.geometry.Size(112f, 72f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(6f), style = Stroke(3f))
                drawPath(Path().apply { moveTo(50f, 26f); lineTo(76f, 40f); lineTo(50f, 54f); close() }, grey, style = Stroke(3f, join = StrokeJoin.Round))
            }
        }
        T(text, 44, color = Color(0xFFB8BCC6), align = TextAlign.Center)
    }
}

/**
 * RTSP (or HTTP/HLS) stream from the sanctuary encoder, with the service audio. [muted] plays it
 * silently (Devices "Mute Live", scheduled Live mode only; Watch Live and the Green Room keep sound).
 */
@OptIn(UnstableApi::class)
@Composable
fun LivePlayer(address: String, muted: Boolean = false) {
    val ctx = LocalContext.current
    // Covered until the first frame is drawn: on the Fire stick the video surface shows solid
    // green while the stream connects.
    val started = remember(address) { mutableStateOf(false) }
    // Reconnect (2026-11-13): if the stream isn't there or drops (vMix stopped, MediaMTX
    // restarted), try again every 5 seconds instead of staying on the cover until the next
    // schedule change. Found in the first live test: the TVs never came back after the stream did.
    val handler = remember { android.os.Handler(android.os.Looper.getMainLooper()) }
    val released = remember(address) { booleanArrayOf(false) }
    val player = remember(address) {
        ExoPlayer.Builder(ctx).setLoadControl(liveLoadControl()).build().apply {
            val p = this
            addListener(object : Player.Listener {
                override fun onRenderedFirstFrame() { started.value = true }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    android.util.Log.i("Signage", "Live stream error (${error.errorCodeName}); retrying in 5 s")
                    started.value = false
                    handler.postDelayed({ if (!released[0]) { p.prepare(); p.playWhenReady = true } }, 5_000)
                }
            })
            loadLive(this, address)
            if (muted) volume = 0f  // from the first frame, before the effect below runs
            prepare()
            playWhenReady = true
        }
    }
    // Watchdog: when the RTSP source goes away, ExoPlayer often freezes on the last frame without
    // an error (seen with MediaMTX when vMix stopped). If playback hasn't moved for 10 seconds,
    // reconnect from scratch.
    DisposableEffect(player) {
        var lastPos = -1L
        var stuckSince = 0L
        val tick = object : Runnable {
            override fun run() {
                if (released[0]) return
                val pos = player.currentPosition
                val now = android.os.SystemClock.elapsedRealtime()
                if (pos != lastPos) { lastPos = pos; stuckSince = now }
                else if (now - stuckSince >= 10_000) {
                    android.util.Log.i("Signage", "Live stream stalled for 10 s; reconnecting")
                    started.value = false
                    player.stop()
                    loadLive(player, address)
                    player.prepare()
                    player.playWhenReady = true
                    stuckSince = now
                }
                handler.postDelayed(this, 2_000)
            }
        }
        handler.postDelayed(tick, 2_000)
        onDispose { released[0] = true; handler.removeCallbacksAndMessages(null); player.release() }
    }
    // Follows the Sheet: checking or unchecking Mute Live takes effect at the next sheet poll.
    LaunchedEffect(player, muted) { player.volume = if (muted) 0f else 1f }
    Box(Modifier.fillMaxSize()) {
        AndroidView(
            factory = {
                (LayoutInflater.from(it).inflate(R.layout.player_view, null) as PlayerView).apply {
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    this.player = player
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        if (!started.value) {
            Box(Modifier.fillMaxSize().background(Color(0xFF1F242C)), contentAlignment = Alignment.Center) {
                T("Connecting to the sanctuary feed…", 30, color = Color(0xFFAAB2BD))
            }
        }
    }
}

/**
 * RTSP over TCP (2026-11-13): the TVs get the stream over Wi-Fi, where RTP over UDP can lose
 * packets (blocky video, audio drops). TCP resends them. HTTP/HLS addresses play as before.
 */
@OptIn(UnstableApi::class)
private fun loadLive(player: ExoPlayer, address: String) {
    val item = MediaItem.fromUri(Uri.parse(address))
    if (address.startsWith("rtsp", ignoreCase = true)) {
        player.setMediaSource(androidx.media3.exoplayer.rtsp.RtspMediaSource.Factory().setForceUseRtpTcp(true).createMediaSource(item))
    } else {
        player.setMediaItem(item)
    }
}

/**
 * Smaller buffers than ExoPlayer's defaults (2.5 s before starting, 5 s after a stall) so the
 * TVs run closer to the room: 0.75 s to start, 1.5 s after a stall. Measured before this change:
 * 4-5 s behind vMix.
 */
@OptIn(UnstableApi::class)
private fun liveLoadControl() = androidx.media3.exoplayer.DefaultLoadControl.Builder()
    .setBufferDurationsMs(1_500, 8_000, 750, 1_500)
    .build()

/** Watch Live on a classroom or from the home screen, for a local stream: the video full screen. */
@Composable
fun LivePlayerScreen(feed: LiveFeed) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        LivePlayer(feed.address)
        T("Press Back to return", 24, color = Color.White.copy(alpha = 0.7f), modifier = Modifier.align(Alignment.TopEnd).padding(u(32)))
    }
}

@Composable
fun BlackScreen() {
    Box(Modifier.fillMaxSize().background(Color.Black))
}

// ---- Banners -------------------------------------------------------------

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
