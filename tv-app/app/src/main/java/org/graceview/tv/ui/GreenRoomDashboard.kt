package org.graceview.tv.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import org.graceview.tv.data.AvantisState
import org.graceview.tv.data.GreenRoomFeed
import org.graceview.tv.data.GreenRoomLogic
import org.graceview.tv.data.GreenRoomSettings
import org.graceview.tv.data.ItemState
import org.graceview.tv.data.MicRow
import org.graceview.tv.data.OosRow
import org.graceview.tv.data.Plan
import org.graceview.tv.data.ProState
import org.graceview.tv.data.Theme
import java.io.File
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.graceview.tv.Config

private val BG = Color(0xFF111418)
private val PANEL = Color(0xFF1B2027)
private val VIDEO_BG = Color(0xFF1F242C)
private val TEXT = Color(0xFFF2F4F7)
private val DIM = Color(0xFFAAB2BD)
private val DONE = Color(0xFF8A929E)
private val NOW_BG = Color(0xFF2A313B)
private val MUTED_BG = Color(0xFF3A414C)
private val MUTED_TEXT = Color(0xFFC3C9D2)
private val MIC_LIVE = Color(0xFFE5484D)
private val STAGE = Color(0xFFF2C230)
private val STAGE_TEXT = Color(0xFF1A1A1A)

private val CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
private val ITEM_TIME = DateTimeFormatter.ofPattern("h:mm", Locale.US)
private val SHORT_DAY = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private val LONG_DAY = DateTimeFormatter.ofPattern("MMMM d", Locale.US)

/** design/GreenRoom-Dashboard.html (live) and GreenRoom-Offline.html (no stream). */
@Composable
fun GreenRoomDashboard(
    theme: Theme,
    logo: File?,
    settings: GreenRoomSettings,
    plan: Plan?,
    planError: String?,
    pro: ProState?,
    avantis: AvantisState?,
    /** The Active local stream is up: play it in the video panel. */
    localStream: String?,
    youtubeLive: Boolean,
) {
    val now by rememberNow()
    val accent = Color(theme.accent)
    val stage = pro?.stageMessage.orEmpty()
    val showStage = stage.isNotBlank() && !stale(pro?.updatedAt)
    val live = localStream != null || youtubeLive
    val videoW = if (showStage) 1024 else 1088
    val oosH = if (showStage) 508 else 572

    Column(Modifier.fillMaxSize().background(BG)) {
        TopBar(theme, logo, plan, pro, live, now, accent)
        if (showStage) StageStrip(stage)
        Row(Modifier.fillMaxSize().padding(u(32)), horizontalArrangement = Arrangement.spacedBy(u(32))) {
            Column(Modifier.width(u(videoW)).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(u(32))) {
                VideoPanel(videoW, logo, theme.displayName, localStream, youtubeLive)
                MicPanel(GreenRoomLogic.mics(settings, plan, avantis), settings, avantis)
            }
            Column(Modifier.weight(1f).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(u(32))) {
                OrderPanel(oosH, plan, planError, pro, now, accent)
                if (plan != null) BandPanel(plan, settings.hideDeclined)
            }
        }
    }
}

private fun stale(at: Long?) = at != null && at > 0 && System.currentTimeMillis() - at > GreenRoomFeed.STALE_MS

private fun updatedText(at: Long?): String? = if (stale(at))
    "Updated " + ZonedDateTime.ofInstant(Instant.ofEpochMilli(at!!), Config.ZONE).format(CLOCK) else null

// ---- Top bar ------------------------------------------------------------------

@Composable
private fun TopBar(theme: Theme, logo: File?, plan: Plan?, pro: ProState?, live: Boolean, now: ZonedDateTime, accent: Color) {
    val timer = pro?.timer?.takeIf { !stale(pro.updatedAt) }
    Row(
        Modifier.fillMaxWidth().height(u(96)).background(accent).padding(horizontal = u(32)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(24))) {
            Logo(logo, theme.displayName, width = 180, maxHeight = 72, textColor = Color.White)
            Box(Modifier.width(u(2)).height(u(56)).background(Color.White.copy(alpha = 0.6f)))
            if (timer != null) {
                Column {
                    T("Green Room", 30, weight = FontWeight.SemiBold, lineHeight = 1.1f)
                    plan?.let { T(planLine(it, SHORT_DAY), 22, maxLines = 1) }
                }
            } else {
                T("Green Room", 34, weight = FontWeight.SemiBold)
            }
        }

        if (timer != null) {
            Row(
                Modifier.background(Color.Black.copy(alpha = 0.28f), RoundedCornerShape(u(12))).padding(horizontal = u(28), vertical = u(6)),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(u(18)),
            ) {
                T(pro.timerLabel(), 24, weight = FontWeight.SemiBold, letterSpacingEm = 0.08f)
                T(timer, 60, weight = FontWeight.Bold, family = Montserrat, lineHeight = 1.1f)
                T(if (pro.timerOver) "over" else "left", 24)
            }
        } else if (plan != null) {
            T(planLine(plan, LONG_DAY), 32, weight = FontWeight.SemiBold, maxLines = 1)
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(28))) {
            if (live) {
                Row(
                    Modifier.background(Color.White, RoundedCornerShape(u(8))).padding(horizontal = u(18), vertical = u(8)),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(u(10)),
                ) {
                    Box(Modifier.size(u(14)).background(accent, RoundedCornerShape(u(7))))
                    T("LIVE", 26, weight = FontWeight.ExtraBold, family = Montserrat, color = accent, letterSpacingEm = 0.08f)
                }
            } else {
                startsIn(plan, now)?.let { T("Service starts in $it", 28, weight = FontWeight.SemiBold) }
            }
            T(now.format(CLOCK), 44, weight = FontWeight.Light)
        }
    }
}

private fun ProState.timerLabel(): String = timerName.uppercase(Locale.US).ifBlank { "TIMER" }

private fun planLine(plan: Plan, fmt: DateTimeFormatter) =
    listOfNotNull(plan.title.takeIf { it.isNotBlank() }, plan.date?.format(fmt)).joinToString(" · ")

/** "1:12" when the service is later today. */
private fun startsIn(plan: Plan?, now: ZonedDateTime): String? {
    val s = plan?.serviceStart ?: return null
    if (!s.isAfter(now) || s.toLocalDate() != now.toLocalDate()) return null
    val mins = Duration.between(now, s).toMinutes().coerceAtLeast(0)
    return "%d:%02d".format(mins / 60, mins % 60)
}

// ---- Stage message ----------------------------------------------------------------

private val speaker = listOf("M6 20h8l14-10v28L14 28H6z", "M34 18a8 8 0 0 1 0 12").map { PathParser().parsePathString(it).toPath() }

@Composable
private fun StageStrip(message: String) {
    Row(
        Modifier.fillMaxWidth().height(u(64)).background(STAGE).padding(horizontal = u(32)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(u(18)),
    ) {
        Canvas(Modifier.size(u(34))) {
            val s = size.width / 48f
            scale(s, s, pivot = Offset.Zero) { speaker.forEach { drawPath(it, STAGE_TEXT, style = Stroke(4f, join = StrokeJoin.Round)) } }
        }
        T("STAGE MESSAGE", 24, weight = FontWeight.SemiBold, color = STAGE_TEXT, letterSpacingEm = 0.08f)
        T(message, 32, weight = FontWeight.SemiBold, color = STAGE_TEXT, maxLines = 1)
    }
}

// ---- Left: video and mics ---------------------------------------------------------

@Composable
private fun VideoPanel(width: Int, logo: File?, name: String, localStream: String?, youtubeLive: Boolean) {
    Box(
        Modifier.width(u(width)).height(u(width * 9 / 16)).background(VIDEO_BG, RoundedCornerShape(u(12))).clipToBounds(),
        contentAlignment = Alignment.Center,
    ) {
        if (localStream != null) {
            LivePlayer(localStream)
            T(
                "Sanctuary feed", 24, weight = FontWeight.SemiBold,
                modifier = Modifier.align(Alignment.TopStart).padding(u(18))
                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(u(6))).padding(horizontal = u(14), vertical = u(6)),
            )
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(u(20))) {
                Box(Modifier.alpha(0.85f)) { Logo(logo, name, width = 300, maxHeight = 160, textColor = Color.White) }
                Spacer(Modifier.height(u(12)))
                if (youtubeLive) {
                    T("Live on YouTube", 48, weight = FontWeight.Bold, family = Montserrat)
                    T("Open Watch Live on the home screen to view it.", 30, color = DIM)
                } else {
                    T("No live stream right now", 48, weight = FontWeight.Bold, family = Montserrat)
                    T("The sanctuary feed appears here when the stream starts.", 30, color = DIM)
                }
            }
        }
    }
}

@Composable
private fun Panel(modifier: Modifier, gap: Int, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.background(PANEL, RoundedCornerShape(u(12))).padding(horizontal = u(28), vertical = u(20)).clipToBounds(),
        verticalArrangement = Arrangement.spacedBy(u(gap)),
        content = content,
    )
}

@Composable
private fun PanelHeader(title: String, note: String?) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        T(title, 28, weight = FontWeight.Bold, family = Montserrat, color = TEXT)
        note?.let { T(it, 22, color = DIM) }
    }
}

@Composable
private fun ColumnScope.MicPanel(mics: List<MicRow>, settings: GreenRoomSettings, avantis: AvantisState?) {
    val note = when {
        settings.avantis.isBlank() -> null
        avantis?.connected != true -> "Console not connected"
        else -> updatedText(avantis.updatedAt) ?: "Live status from the Avantis"
    }
    // Only mics with someone assigned, plus any unassigned mic that's live (a spare turned on).
    // With no plan loaded, every mic in the map shows so the labels are still there.
    val shown = if (mics.any { it.name.isNotBlank() }) mics.filter { it.name.isNotBlank() || it.muted == false } else mics
    Panel(Modifier.fillMaxWidth().weight(1f), 14) {
        PanelHeader("Mic Assignments", note)
        if (mics.isEmpty()) {
            T("Add mics to the Mic Map in the Green Room tab of the schedule sheet.", 24, color = DIM)
        }
        shown.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(u(24))) {
                row.forEach { MicCell(it, Modifier.weight(1f)) }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun MicCell(m: MicRow, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(14))) {
        val liveMic = m.muted == false
        Column(
            Modifier.width(u(84))
                .then(if (liveMic) Modifier.border(u(3), Color.White, RoundedCornerShape(u(6))) else Modifier)
                .background(if (liveMic) MIC_LIVE else MUTED_BG, RoundedCornerShape(u(6)))
                .padding(vertical = u(5)),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            T(m.label, 22, weight = FontWeight.SemiBold, maxLines = 1, align = TextAlign.Center, lineHeight = 1.15f)
            when (m.muted) {
                true -> T("MUTED", 16, color = MUTED_TEXT, lineHeight = 1.15f)
                false -> T("LIVE", 16, weight = FontWeight.ExtraBold, letterSpacingEm = 0.08f, lineHeight = 1.15f)
                null -> {}
            }
        }
        Column {
            T(m.name.ifBlank { "—" }, 26, weight = FontWeight.SemiBold, color = TEXT, maxLines = 1)
            if (m.role.isNotBlank()) T(m.role, 22, color = DIM, maxLines = 1)
        }
    }
}

// ---- Right: order of service and band ---------------------------------------------

@Composable
private fun OrderPanel(height: Int, plan: Plan?, error: String?, pro: ProState?, now: ZonedDateTime, accent: Color) {
    Panel(Modifier.fillMaxWidth().height(u(height)), 8) {
        PanelHeader("Order of Service", plan?.let { updatedText(it.updatedAt) })
        if (plan == null) {
            T(error ?: "Loading the plan from Planning Center…", 26, color = DIM, lineHeight = 1.3f)
            return@Panel
        }
        val live = pro?.takeIf { !stale(it.updatedAt) }
        val presentation = live?.presentation
        val rows = GreenRoomLogic.orderOfService(plan, now, listOfNotNull(live?.playlistItem, live?.presentation))
        // Keep NOW in view: start two rows above it.
        val nowIdx = rows.indexOfFirst { it.state == ItemState.Now }
        val first = if (nowIdx > 2) nowIdx - 2 else 0
        val onScreen = if (live != null && presentation != null && live.slide != null) {
            "On screen: Slide ${live.slide}" + (live.slideCount?.let { " of $it" } ?: "")
        } else null
        rows.drop(first).forEach { r -> OosLine(r, accent, if (r.state == ItemState.Now) onScreen else null) }
    }
}

@Composable
private fun OosLine(r: OosRow, accent: Color, onScreen: String?) {
    if (r.isHeader) {
        T(r.title.uppercase(Locale.US), 20, weight = FontWeight.SemiBold, color = DIM, letterSpacingEm = 0.06f, maxLines = 1,
            modifier = Modifier.padding(top = u(6)))
        return
    }
    val time = r.start?.format(ITEM_TIME).orEmpty()
    val length = if (r.lengthSec > 0) "%d:%02d".format(r.lengthSec / 60, r.lengthSec % 60) else ""
    if (r.state == ItemState.Now) {
        Row(Modifier.fillMaxWidth()) {
            Box(Modifier.width(u(6)).height(u(if (onScreen != null) 84 else 52)).background(accent, RoundedCornerShape(topStart = u(6), bottomStart = u(6))))
            Column(
                Modifier.fillMaxWidth().background(NOW_BG, RoundedCornerShape(topEnd = u(6), bottomEnd = u(6))).padding(horizontal = u(16), vertical = u(10)),
                verticalArrangement = Arrangement.spacedBy(u(4)),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(18))) {
                    T(time, 24, weight = FontWeight.SemiBold, color = TEXT, modifier = Modifier.width(u(84)))
                    T(r.title + keyText(r), 28, weight = FontWeight.SemiBold, color = TEXT, maxLines = 1, modifier = Modifier.weight(1f))
                    T("NOW", 20, weight = FontWeight.SemiBold, letterSpacingEm = 0.06f,
                        modifier = Modifier.background(accent, RoundedCornerShape(u(6))).padding(horizontal = u(10), vertical = u(2)))
                }
                onScreen?.let { T(it, 22, color = MUTED_TEXT, modifier = Modifier.padding(start = u(102))) }
            }
        }
        return
    }
    val done = r.state == ItemState.Done
    Row(Modifier.fillMaxWidth().padding(vertical = u(4)), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(u(18))) {
        T(time, 24, color = if (done) DONE else TEXT, modifier = Modifier.width(u(90)))
        Row(Modifier.weight(1f)) {
            T(r.title, 26, color = if (done) DONE else TEXT, maxLines = 1)
            if (r.key.isNotBlank()) T(keyText(r), 26, color = if (done) DONE else DIM, maxLines = 1)
        }
        T(length, 22, color = if (done) DONE else DIM)
    }
}

private fun keyText(r: OosRow) = if (r.key.isNotBlank()) " · Key ${r.key}" else ""

@Composable
private fun ColumnScope.BandPanel(plan: Plan, hideDeclined: Boolean) {
    val band = GreenRoomLogic.band(plan, hideDeclined)
    Panel(Modifier.fillMaxWidth().weight(1f), 12) {
        PanelHeader("Band", null)
        if (band.isEmpty()) T("No one is scheduled on this plan yet.", 24, color = DIM)
        band.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(u(28))) {
                row.forEach { b ->
                    Column(Modifier.weight(1f)) {
                        T(b.name, 26, weight = FontWeight.SemiBold, color = TEXT, maxLines = 1)
                        if (b.roles.isNotBlank()) T(b.roles, 22, color = DIM, maxLines = 1)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}
