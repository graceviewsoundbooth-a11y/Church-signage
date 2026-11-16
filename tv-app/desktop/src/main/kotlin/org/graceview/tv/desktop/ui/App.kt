package org.graceview.tv.desktop.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.delay
import org.graceview.tv.Config
import org.graceview.tv.data.Mode
import org.graceview.tv.desktop.EventScreen

@Composable
fun EventScreenApp(app: EventScreen, banner: String?) {
    val sheet by app.sheet.collectAsState()
    val error by app.sheetError.collectAsState()
    val device by app.deviceName.collectAsState()
    val pickerRequested by app.pickerRequested.collectAsState()
    val resolved by app.resolved.collectAsState()
    val slides by app.slides.collectAsState()
    val events by app.events.collectAsState()
    val weather by app.weather.collectAsState()
    val logos by app.logos.collectAsState()
    val applied by app.applied.collectAsState()
    val shown by app.shownMode.collectAsState()
    val note by app.note.collectAsState()

    // Hide the note when its time is up.
    var noteVisible by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(note) {
        val n = note ?: run { noteVisible = null; return@LaunchedEffect }
        noteVisible = n.first
        delay((n.second - System.currentTimeMillis()).coerceAtLeast(0))
        noteVisible = null
    }

    val r = resolved
    DesignCanvas(fill = r?.theme?.let { Color(it.main) } ?: Color.Black) {
        val s = sheet
        when {
            Config.API_KEY.isBlank() ->
                StatusScreen("Google API key is missing", "Add google.apiKey to android/local.properties and rebuild.")
            s == null && error != null ->
                StatusScreen("Can't load the schedule sheet", "$error\n\nTrying again every 3 minutes. Is this PC online?")
            s == null ->
                StatusScreen("Starting up…", "Loading the schedule sheet.")
            s.devices.isEmpty() ->
                StatusScreen("No devices in the sheet", "Add an Event Screen row in the Devices tab.")
            pickerRequested || device == null || r == null ->
                DevicePicker(s.devices, device) { app.chooseDevice(it) }
            else -> {
                val dev = r.device
                val theme = r.theme
                val hint = emptyHint(r.folderName, r.folderId != null)
                val logo = logos.first ?: logos.second
                when (shown ?: Mode.Signage) {
                    Mode.Fullscreen -> FullscreenScreen(theme, slides, hint)
                    Mode.Countdown -> applied?.let { CountdownScreen(theme, it, slides, hint, logo) }
                        ?: FullscreenScreen(theme, slides, hint)
                    Mode.Live -> LiveScreen(theme, applied, app.liveFeed(), logo, muted = dev.muteLive)
                    Mode.Message -> MessageScreen(theme, applied?.message.orEmpty(), logo)
                    Mode.Off -> BlackScreen()
                    // Signage, and the TV-only modes (Launcher, Live Option, Dashboard).
                    else -> SignageScreen(dev.withWayfinding(theme), r.folderName, r.folderId != null, slides, events, weather, logos.first, logos.second)
                }
            }
        }
        (banner ?: noteVisible)?.let { BottomBanner(it) }
    }
}
