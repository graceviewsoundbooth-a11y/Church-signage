package org.graceview.tv.ui

import android.content.Intent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.core.graphics.drawable.toBitmap
import androidx.compose.ui.draw.clip
import org.graceview.tv.Config
import org.graceview.tv.data.CalEvent
import org.graceview.tv.data.Qr
import org.graceview.tv.data.Device
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
import org.graceview.tv.data.Weather
import org.graceview.tv.system.Platform
import java.io.File
import java.time.format.DateTimeFormatter
import java.util.Locale

private val SHORT_DATE = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US)
private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
private val TILE_BG = Color(0xFF2C3442)

enum class TileIcon { Signage, Live, Mirror, Hdmi, YouTube, Web, Store, Apps, Settings, Dashboard }

data class TileSpec(
    val label: String,
    val icon: TileIcon,
    val live: Boolean = false,
    /** Wide tile with a second line (Green Room Dashboard). */
    val subtitle: String? = null,
    /** An installed app's own icon or banner (Launchers-page app tiles). */
    val image: androidx.compose.ui.graphics.ImageBitmap? = null,
    val onClick: () -> Unit,
)

/**
 * Church Signage: the tile row from the dashboard's Launchers page, in its order. Tiles that don't
 * apply on this TV are left out (Return to Signage off signage TVs, the dashboard off Green Room TVs,
 * Watch Live when nothing is live, apps that aren't installed, HDMI where there's no input).
 */
private fun layoutTiles(
    ctx: android.content.Context,
    layout: org.graceview.tv.data.LabLauncher,
    device: Device,
    showWatchLive: Boolean,
    onReturnToSignage: () -> Unit,
    onWatchLive: () -> Unit,
    onLaunch: (Intent) -> Unit,
    onAllApps: () -> Unit,
    onMirrorHelp: () -> Unit,
    onAnnouncements: () -> Unit,
    onDashboard: () -> Unit,
): List<TileSpec> = layout.tiles.mapNotNull { t ->
    when (t.type) {
        "return" -> if (device.isSignage) TileSpec(t.label.ifBlank { "Return to Signage" }, TileIcon.Signage, onClick = onReturnToSignage) else null
        "watchlive" -> if (showWatchLive) TileSpec(t.label.ifBlank { "Watch Live" }, TileIcon.Live, live = true, onClick = onWatchLive) else null
        "announcements" -> TileSpec(t.label.ifBlank { "Announcements" }, TileIcon.Signage, onClick = onAnnouncements)
        "dashboard" -> if (device.isGreenRoom) TileSpec(t.label.ifBlank { "Green Room Dashboard" }, TileIcon.Dashboard, subtitle = "Mics, order of service, band, live feed", onClick = onDashboard) else null
        "mirror" -> TileSpec(t.label.ifBlank { "Screen Mirror" }, TileIcon.Mirror) { Platform.screenMirror(ctx)?.let(onLaunch) ?: onMirrorHelp() }
        "hdmi" -> Platform.hdmiInput(ctx)?.let { TileSpec(t.label.ifBlank { "HDMI Input" }, TileIcon.Hdmi) { onLaunch(it) } }
        "youtube" -> Platform.youtube(ctx)?.let { TileSpec(t.label.ifBlank { "YouTube" }, TileIcon.YouTube) { onLaunch(it) } }
        "browser" -> Platform.browser(ctx)?.let { TileSpec(t.label.ifBlank { "Web Browser" }, TileIcon.Web) { onLaunch(it) } }
        "store" -> Platform.store(ctx)?.let { TileSpec(t.label.ifBlank { "Get Apps" }, TileIcon.Store) { onLaunch(it) } }
        "allapps" -> TileSpec(t.label.ifBlank { "All Apps" }, TileIcon.Apps, onClick = onAllApps)
        "settings" -> Platform.settings(ctx)?.let { TileSpec(t.label.ifBlank { "Settings" }, TileIcon.Settings) { onLaunch(it) } }
        "app" -> Platform.launchIntent(ctx, t.value)?.let { intent ->
            val img = runCatching {
                val pm = ctx.packageManager
                val d = pm.getApplicationBanner(t.value) ?: pm.getApplicationIcon(t.value)
                d.toBitmap(320, 320).asImageBitmap()
            }.getOrNull()
            TileSpec(t.label.ifBlank { t.value }, TileIcon.Apps, image = img) { onLaunch(intent) }
        }
        "web" -> if (t.value.startsWith("https://", ignoreCase = true)) {
            TileSpec(t.label.ifBlank { "Website" }, TileIcon.Web) {
                onLaunch(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(t.value)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        } else null
        else -> null
    }
}

/** Our home screen (design/Classroom-Home): rotating announcements behind a branded top bar and an app row. */
@Composable
fun LauncherScreen(
    device: Device,
    theme: Theme,
    slides: List<Slide>,
    hint: String,
    weather: Weather?,
    logo: File?,
    showWatchLive: Boolean,
    onReturnToSignage: () -> Unit,
    onWatchLive: () -> Unit,
    onLaunch: (Intent) -> Unit,
    onAllApps: () -> Unit,
    onMirrorHelp: () -> Unit,
    onAnnouncements: () -> Unit,
    onDashboard: () -> Unit = {},
    layout: org.graceview.tv.data.LabLauncher? = null,
    events: List<CalEvent>? = null,
) {
    val ctx = LocalContext.current
    val now by rememberNow()
    val main = Color(theme.main)
    val accent = Color(theme.accent)

    val tiles = remember(device.isSignage, device.isGreenRoom, showWatchLive, layout) {
        if (layout != null && layout.tiles.isNotEmpty()) {
            layoutTiles(ctx, layout, device, showWatchLive, onReturnToSignage, onWatchLive, onLaunch, onAllApps, onMirrorHelp, onAnnouncements, onDashboard)
                .ifEmpty { listOf(TileSpec("All Apps", TileIcon.Apps, onClick = onAllApps)) }
        } else buildList {
            // Green Room: the dashboard comes first, wide, and has focus.
            if (device.isGreenRoom) add(TileSpec("Green Room Dashboard", TileIcon.Dashboard, subtitle = "Mics, order of service, band, live feed", onClick = onDashboard))
            if (device.isSignage) add(TileSpec("Return to Signage", TileIcon.Signage, onClick = onReturnToSignage))
            if (showWatchLive) add(TileSpec("Watch Live", TileIcon.Live, live = true, onClick = onWatchLive))
            // Classrooms: run the announcement loop full screen, like a digital sign. Back returns.
            if (device.usesLauncher) add(TileSpec("Announcements", TileIcon.Signage, onClick = onAnnouncements))
            add(TileSpec("Screen Mirror", TileIcon.Mirror) { Platform.screenMirror(ctx)?.let(onLaunch) ?: onMirrorHelp() })
            Platform.hdmiInput(ctx)?.let { add(TileSpec("HDMI Input", TileIcon.Hdmi) { onLaunch(it) }) }
            // The Green Room home (design/GreenRoom-Home) leaves these out; they're in All Apps.
            if (!device.isGreenRoom) {
                Platform.youtube(ctx)?.let { add(TileSpec("YouTube", TileIcon.YouTube) { onLaunch(it) }) }
                Platform.browser(ctx)?.let { add(TileSpec("Web Browser", TileIcon.Web) { onLaunch(it) }) }
                Platform.store(ctx)?.let { add(TileSpec("Get Apps", TileIcon.Store) { onLaunch(it) }) }
            }
            add(TileSpec("All Apps", TileIcon.Apps, onClick = onAllApps))
            Platform.settings(ctx)?.let { add(TileSpec("Settings", TileIcon.Settings) { onLaunch(it) }) }
        }
    }
    val first = remember { FocusRequester() }

    Box(Modifier.fillMaxSize().background(main)) {
        // The announcements in a 16:9 box (not full screen behind the tiles, where they were hard to see),
        // with guest Wi-Fi and This Week beside them. Same layout as the dashboard's preview.
        Box(
            Modifier.padding(start = u(64), top = u(160)).size(u(960), u(540))
                .clip(RoundedCornerShape(u(18))).background(main),
        ) {
            SlideArea(slides, main, theme.displayName, hint, showDots = false)
        }
        LauncherInfo(theme, events, Modifier.padding(start = u(1088), top = u(160)).size(u(768), u(540)))

        Row(
            Modifier.fillMaxWidth().height(u(120)).background(accent).padding(horizontal = u(72)),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(24))) {
                Logo(logo, theme.displayName, width = 210, maxHeight = 90, textColor = Color.White)
                Box(Modifier.width(u(2)).height(u(48)).background(Color.White.copy(alpha = 0.6f)))
                T(device.name, 34, weight = FontWeight.SemiBold, maxLines = 1)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(40))) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(14))) {
                    WeatherIcon(weather, 58, 40)
                    T(weather?.let { "${it.tempF}°" } ?: "--°", 40, weight = FontWeight.Light)
                }
                T(now.format(SHORT_DATE), 40, weight = FontWeight.Light)
                T(now.format(CLOCK), 40)
            }
        }

        Column(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().height(u(340)).background(Color(0xE0080C14))
                .padding(start = u(64), end = u(64), top = u(30), bottom = u(40)),
            verticalArrangement = Arrangement.spacedBy(u(12)),
        ) {
            T("Apps", 28, weight = FontWeight.SemiBold, letterSpacingEm = 0.06f, modifier = Modifier.padding(start = u(8)))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(u(8))) {
                itemsIndexed(tiles) { i, t -> AppTile(t, accent, if (i == 0) first else null) }
            }
        }
    }
    LaunchedEffect(tiles) { runCatching { first.requestFocus() } }
}

/** Beside the announcements: guest Wi-Fi (QR, network, password), then This Week. No Wi-Fi: This Week has the room. */
@Composable
private fun LauncherInfo(theme: Theme, events: List<CalEvent>?, modifier: Modifier) {
    val text = Color.White // the TV app draws all theme text in white
    val hasWifi = theme.wifiName.isNotBlank()
    Column(modifier, verticalArrangement = Arrangement.spacedBy(u(28))) {
        if (hasWifi) {
            Row(
                Modifier.fillMaxWidth().background(Color(0x47000000), RoundedCornerShape(u(18))).padding(horizontal = u(28), vertical = u(22)),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(u(28)),
            ) {
                QrImage(Qr.wifiPayload(theme.wifiName, theme.wifiPassword), 150)
                Column(verticalArrangement = Arrangement.spacedBy(u(2))) {
                    T("Free Wi-Fi", 34, weight = FontWeight.Bold, family = Montserrat, color = text)
                    T("NETWORK", 20, weight = FontWeight.SemiBold, letterSpacingEm = 0.1f, color = text.copy(alpha = 0.75f), modifier = Modifier.padding(top = u(8)))
                    T(theme.wifiName, 30, color = text, maxLines = 1)
                    if (theme.wifiPassword.isNotBlank()) {
                        T("PASSWORD", 20, weight = FontWeight.SemiBold, letterSpacingEm = 0.1f, color = text.copy(alpha = 0.75f), modifier = Modifier.padding(top = u(8)))
                        T(theme.wifiPassword, 30, color = text, maxLines = 1)
                    }
                }
            }
        }
        if (events != null) {
            Column(Modifier.weight(1f).padding(horizontal = u(8)), verticalArrangement = Arrangement.spacedBy(u(20))) {
                Column {
                    T("This Week", 34, weight = FontWeight.Bold, family = Montserrat, color = text)
                    Spacer(Modifier.height(u(14)))
                    Box(Modifier.fillMaxWidth().height(u(2)).background(text.copy(alpha = 0.6f)))
                }
                // Only events that fit whole: one cut off at the bottom looks broken.
                FitColumn(Modifier.weight(1f).fillMaxWidth(), u(20)) {
                    if (events.isEmpty()) T(Config.NO_EVENTS_TEXT, 30, color = text, lineHeight = 1.2f)
                    else events.take(5).forEach { ev ->
                        Column(verticalArrangement = Arrangement.spacedBy(u(4))) {
                            T(ev.label().uppercase(Locale.US), 22, weight = FontWeight.SemiBold, letterSpacingEm = 0.1f, color = text, maxLines = 1)
                            T(ev.title, 32, color = text, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AppTile(spec: TileSpec, accent: Color, focus: FocusRequester?) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    if (spec.subtitle != null) {
        Box(
            Modifier
                .width(u(416)).height(u(212))
                .then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
                .border(u(6), if (focused) Color.White else Color.Transparent, RoundedCornerShape(u(28)))
                .padding(u(8))
                .background(accent, RoundedCornerShape(u(20)))
                .clickable(interactionSource = src, indication = null, onClick = spec.onClick)
                .padding(horizontal = u(30)),
            contentAlignment = Alignment.CenterStart,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(24))) {
                Glyph(spec.icon, 72)
                Column(verticalArrangement = Arrangement.spacedBy(u(4))) {
                    T(spec.label, 30, weight = FontWeight.SemiBold, maxLines = 2, lineHeight = 1.1f)
                    T(spec.subtitle, 22, maxLines = 2, lineHeight = 1.15f)
                }
            }
        }
        return
    }
    Box(
        Modifier
            .size(u(212))
            .then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
            .border(u(6), if (focused) Color.White else Color.Transparent, RoundedCornerShape(u(28)))
            .padding(u(8))
            .background(if (spec.live) accent else TILE_BG, RoundedCornerShape(u(20)))
            .clickable(interactionSource = src, indication = null, onClick = spec.onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.padding(horizontal = u(10)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(u(14)),
        ) {
            if (spec.image != null) {
                Image(spec.image, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(u(96)))
            } else Glyph(spec.icon, 64)
            // Long single words ("Announcements") get a smaller size so they don't break mid-word.
            val labelSize = if (!spec.label.contains(' ') && spec.label.length > 11) 22 else 26
            T(spec.label, labelSize, weight = FontWeight.SemiBold, maxLines = 2, align = TextAlign.Center, lineHeight = 1.1f)
        }
        if (spec.live) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(u(12))
                    .background(Color.White, RoundedCornerShape(u(6))).padding(horizontal = u(10), vertical = u(4)),
            ) {
                T("LIVE", 16, weight = FontWeight.ExtraBold, family = Montserrat, color = accent, letterSpacingEm = 0.08f)
            }
        }
    }
}

// Icons from the design, drawn in a 48x48 box with a 3.5 white stroke.
private val GLYPHS: Map<TileIcon, List<String>> = mapOf(
    TileIcon.Signage to listOf("M6 10h36v24H6z", "M18 42h12M24 34v8", "M21 17l9 5-9 5z"),
    TileIcon.Live to listOf("M19 24a5 5 0 1 0 10 0a5 5 0 1 0 -10 0", "M14 14a14 14 0 0 0 0 20M34 14a14 14 0 0 1 0 20M8 8a22 22 0 0 0 0 32M40 8a22 22 0 0 1 0 32"),
    TileIcon.Mirror to listOf("M6 32V10h36v26H26", "M6 38h2M6 32a8 8 0 0 1 8 8M6 25a15 15 0 0 1 15 15"),
    TileIcon.Hdmi to listOf("M8 16h32v10l-5 6H13l-5-6z", "M16 32v8M32 32v8"),
    TileIcon.YouTube to listOf("M13 10h22a8 8 0 0 1 8 8v12a8 8 0 0 1 -8 8h-22a8 8 0 0 1 -8 -8v-12a8 8 0 0 1 8 -8z", "M20 18l10 6-10 6z"),
    TileIcon.Web to listOf("M6 24a18 18 0 1 0 36 0a18 18 0 1 0 -36 0", "M6 24h36M24 6c-6 6-6 30 0 36M24 6c6 6 6 30 0 36"),
    TileIcon.Store to listOf("M9 16h30l-3 26H12z", "M17 20v-6a7 7 0 0 1 14 0v6"),
    TileIcon.Dashboard to listOf("M6 6h18a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-18a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z", "M32 6h10a2 2 0 0 1 2 2v32a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-32a2 2 0 0 1 2 -2z", "M6 26h18a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-18a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z"),
    TileIcon.Settings to listOf("M17 24a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M24 4v7M24 37v7M4 24h7M37 24h7M10 10l5 5M33 33l5 5M38 10l-5 5M15 33l-5 5"),
)
private val glyphPaths: Map<TileIcon, List<Path>> by lazy {
    GLYPHS.mapValues { (_, ds) -> ds.map { PathParser().parsePathString(it).toPath() } }
}

@Composable
private fun Glyph(icon: TileIcon, sizePx: Int) {
    Canvas(Modifier.size(u(sizePx))) {
        val s = size.width / 48f
        scale(s, s, pivot = Offset.Zero) {
            if (icon == TileIcon.Apps) {
                for (x in listOf(12f, 24f, 36f)) for (y in listOf(12f, 24f, 36f)) drawCircle(Color.White, 4f, Offset(x, y))
            } else {
                glyphPaths[icon].orEmpty().forEach {
                    drawPath(it, Color.White, style = Stroke(3.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
    }
}

/** Every installed TV app, for the All Apps tile. Back returns to the home screen. */
@Composable
fun AllAppsScreen(onLaunch: (Intent) -> Unit) {
    val ctx = LocalContext.current
    val apps = remember { Platform.allApps(ctx) }
    val first = remember { FocusRequester() }
    Column(Modifier.fillMaxSize().background(Color(0xFF111418)).padding(horizontal = u(96), vertical = u(64))) {
        T("All Apps", 56, weight = FontWeight.Bold, family = Montserrat)
        Spacer(Modifier.height(u(8)))
        T("Press Back to return to the home screen.", 26, color = Color(0xFFBBBBBB))
        Spacer(Modifier.height(u(36)))
        LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            horizontalArrangement = Arrangement.spacedBy(u(16)),
            verticalArrangement = Arrangement.spacedBy(u(16)),
        ) {
            itemsIndexed(apps) { i, app ->
                val src = remember { MutableInteractionSource() }
                val focused by src.collectIsFocusedAsState()
                val img = remember(app.pkg) {
                    runCatching { (app.banner ?: app.icon)?.toBitmap(320, if (app.banner != null) 180 else 320)?.asImageBitmap() }.getOrNull()
                }
                Column(
                    Modifier
                        .then(if (i == 0) Modifier.focusRequester(first) else Modifier)
                        .border(u(5), if (focused) Color.White else Color.Transparent, RoundedCornerShape(u(16)))
                        .padding(u(6))
                        .background(TILE_BG, RoundedCornerShape(u(12)))
                        .clickable(interactionSource = src, indication = null) {
                            Platform.launchIntent(ctx, app.pkg)?.let(onLaunch)
                        }
                        .padding(u(14)),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(u(10)),
                ) {
                    Box(Modifier.fillMaxWidth().height(u(150)), contentAlignment = Alignment.Center) {
                        if (img != null) Image(img, contentDescription = app.label, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                    }
                    T(app.label, 24, maxLines = 1, align = TextAlign.Center)
                }
            }
        }
    }
    LaunchedEffect(apps) { runCatching { first.requestFocus() } }
}

/** Shown by Screen Mirror when the TV has no mirroring settings screen to open. */
@Composable
fun MirrorHelp() {
    Box(Modifier.fillMaxSize().background(Color(0xCC000000)), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(u(1100)).background(Color(0xFF1B2028), RoundedCornerShape(u(24))).padding(u(64)),
            verticalArrangement = Arrangement.spacedBy(u(24)),
        ) {
            T("Screen Mirror", 56, weight = FontWeight.Bold, family = Montserrat)
            T("This TV can show your screen. On a phone or laptop on the church Wi-Fi:", 32, lineHeight = 1.3f)
            T("• Chrome on a laptop: menu ⋮ → Cast… → pick this TV\n• Android: Quick Settings → Cast or Screen Cast\n• iPhone: use the YouTube or Google Photos Cast button", 30, lineHeight = 1.45f, color = Color(0xFFD6D9DF))
            T("Press Back to close.", 26, color = Color(0xFFBBBBBB))
        }
    }
}
