package org.graceview.tv.desktop

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import kotlinx.coroutines.delay
import org.graceview.tv.Config
import org.graceview.tv.data.Mode
import org.graceview.tv.desktop.ui.EventScreenApp
import java.awt.Cursor
import java.awt.GraphicsDevice
import java.awt.GraphicsEnvironment
import java.awt.Point
import java.awt.Toolkit
import java.awt.image.BufferedImage

/**
 * Graceview Event Screen. Arguments (for testing): --windowed starts in a window,
 * --fakeNow 2026-11-15T15:05:00 runs the clock from that time, --mode Live starts in a manual
 * mode (like F1-F3), --liveUrl rtsp://... plays that stream in Live mode instead of the Sheet's.
 */
fun main(args: Array<String>) {
    Config.API_KEY = BuildInfo.GOOGLE_API_KEY
    DesktopLog.init()
    args.indexOf("--fakeNow").takeIf { it >= 0 }?.let { i -> args.getOrNull(i + 1)?.let { Clock.fake(it) } }
    val startWindowed = "--windowed" in args

    val app = EventScreen()
    // Testing without a keyboard in front of the window: --mode Live is F3, --liveUrl plays another stream.
    args.indexOf("--liveUrl").takeIf { it >= 0 }?.let { i -> app.testLiveUrl = args.getOrNull(i + 1) }
    app.start()
    args.indexOf("--mode").takeIf { it >= 0 }?.let { i -> Mode.parse(args.getOrNull(i + 1).orEmpty())?.let { app.setManual(it) } }

    application {
        var fullscreen by remember { mutableStateOf(!startWindowed) }
        var monitor by remember { mutableStateOf(Prefs.monitor) }
        var escPressedAt by remember { mutableLongStateOf(0L) }
        val picker by app.pickerRequested.collectAsState()
        val deviceName by app.deviceName.collectAsState()

        LaunchedEffect(escPressedAt) {
            if (escPressedAt != 0L) { delay(3_000); escPressedAt = 0L }
        }

        fun onKey(e: KeyEvent): Boolean {
            if (e.type != KeyEventType.KeyDown) return false
            when {
                e.key == Key.F1 -> app.setManual(Mode.Signage)
                e.key == Key.F2 -> app.setManual(Mode.Fullscreen)
                e.key == Key.F3 -> app.setManual(Mode.Live)
                e.key == Key.F4 -> app.setManual(null)
                e.key == Key.F11 -> fullscreen = !fullscreen
                e.isCtrlPressed && e.key == Key.M -> {
                    val screens = GraphicsEnvironment.getLocalGraphicsEnvironment().screenDevices
                    val next = (monitorIndex(screens, monitor) + 1) % screens.size
                    monitor = next
                    Prefs.monitor = next
                    app.showNote("Monitor ${next + 1} of ${screens.size}")
                }
                e.isCtrlPressed && e.key == Key.D -> app.requestPicker()
                e.key == Key.Escape -> {
                    if (escPressedAt != 0L) exitApplication() else escPressedAt = System.currentTimeMillis()
                }
                else -> return false
            }
            return true
        }

        // Full screen is a borderless window covering the chosen monitor exactly (Compose's own
        // Fullscreen placement kept the title bar on Windows). F11 and Ctrl+M rebuild the window.
        key(fullscreen, monitor) {
        val screens = GraphicsEnvironment.getLocalGraphicsEnvironment().screenDevices
        val b = screens[monitorIndex(screens, monitor)].defaultConfiguration.bounds
        val state = rememberWindowState(
            placement = WindowPlacement.Floating,
            position = if (fullscreen) WindowPosition(b.x.dp, b.y.dp) else WindowPosition((b.x + 40).dp, (b.y + 40).dp),
            size = if (fullscreen) DpSize(b.width.dp, b.height.dp) else DpSize(minOf(1280, b.width - 80).dp, minOf(720, b.height - 80).dp),
        )
        Window(
            onCloseRequest = ::exitApplication,
            state = state,
            title = "Graceview Event Screen",
            icon = painterResource("icon.png"),
            undecorated = fullscreen,
            resizable = !fullscreen,
            onPreviewKeyEvent = ::onKey,
        ) {
            // Take the keyboard when the window opens, so F1-F4 and Esc work right away.
            LaunchedEffect(Unit) { window.toFront(); window.requestFocus() }
            // No mouse pointer over the full-screen signage; it's back for the device picker.
            val showCursor = !fullscreen || picker || deviceName == null
            LaunchedEffect(showCursor) {
                window.cursor = if (showCursor) Cursor.getDefaultCursor() else BLANK_CURSOR
            }
            EventScreenApp(app, banner = if (escPressedAt != 0L) "Press Esc again to close the Event Screen." else null)
        }
        }
    }
}

/** The saved monitor, or a second screen (the projector) if there is one, or the main screen. */
private fun monitorIndex(screens: Array<GraphicsDevice>, saved: Int): Int {
    if (saved in screens.indices) return saved
    val primary = GraphicsEnvironment.getLocalGraphicsEnvironment().defaultScreenDevice
    return screens.indexOfFirst { it != primary }.takeIf { it >= 0 } ?: 0
}

private val BLANK_CURSOR: Cursor by lazy {
    Toolkit.getDefaultToolkit().createCustomCursor(BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB), Point(0, 0), "blank")
}
