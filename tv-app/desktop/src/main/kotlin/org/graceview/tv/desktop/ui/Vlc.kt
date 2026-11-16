package org.graceview.tv.desktop.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import org.graceview.tv.desktop.DesktopLog
import org.jetbrains.skia.ColorAlphaType
import org.jetbrains.skia.ColorType
import org.jetbrains.skia.FilterMipmap
import org.jetbrains.skia.FilterMode
import org.jetbrains.skia.Image
import org.jetbrains.skia.ImageInfo
import org.jetbrains.skia.MipmapMode
import org.jetbrains.skia.Rect
import uk.co.caprica.vlcj.factory.MediaPlayerFactory
import uk.co.caprica.vlcj.log.LogLevel
import uk.co.caprica.vlcj.log.NativeLog
import uk.co.caprica.vlcj.factory.discovery.NativeDiscovery
import uk.co.caprica.vlcj.player.base.MediaPlayer
import uk.co.caprica.vlcj.player.base.MediaPlayerEventAdapter
import uk.co.caprica.vlcj.player.embedded.EmbeddedMediaPlayer
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.BufferFormat
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.BufferFormatCallback
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.RenderCallback
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.format.RV32BufferFormat
import java.io.File
import java.nio.ByteBuffer
import kotlin.concurrent.thread

/**
 * VLC (through vlcj) plays MP4 slides and the RTSP live feed. The packaged app carries VLC's
 * libraries in its resources (vlc/); from Gradle it uses GRACEVIEW_VLC_DIR, then
 * C:\GraceviewTools\vlc\vlc-3.0.21, then an installed VLC.
 */
object Vlc {
    private val factory: MediaPlayerFactory? by lazy { create() }

    val available: Boolean get() = factory != null

    /** Kept so the log isn't garbage-collected. */
    private var vlcLog: NativeLog? = null

    private fun bundledDir(): File? = listOfNotNull(
        System.getProperty("compose.application.resources.dir")?.let { File(it, "vlc") },
        System.getenv("GRACEVIEW_VLC_DIR")?.let { File(it) },
        File("C:\\GraceviewTools\\vlc\\vlc-3.0.21"),
    ).firstOrNull { File(it, "libvlc.dll").exists() }

    private fun create(): MediaPlayerFactory? = try {
        // vlcj's discovery looks in jna.library.path first and sets VLC's plugin path from there.
        bundledDir()?.let {
            System.setProperty("jna.library.path", it.absolutePath)
            DesktopLog.i("Vlc", "Using VLC in ${it.absolutePath}")
        }
        if (!NativeDiscovery().discover()) DesktopLog.w("Vlc", "VLC not found by discovery; trying the default path")
        MediaPlayerFactory("--no-video-title-show", "--no-snapshot-preview", "--no-osd", "--no-stats", "--no-lua").also { f ->
            // VLC's own errors go to the app log (log.txt), for troubleshooting a stream.
            f.application().newLog()?.let { log ->
                log.setLevel(LogLevel.ERROR)
                log.addLogListener { level, module, _, _, _, _, _, message -> DesktopLog.w("Vlc", "$level $module: $message") }
                vlcLog = log
            }
        }
    } catch (e: Throwable) {
        DesktopLog.w("Vlc", "VLC isn't available: videos and Live won't play", e)
        null
    }

    fun newPlayer(sink: FrameSink): EmbeddedMediaPlayer? = factory?.let { f ->
        f.mediaPlayers().newEmbeddedMediaPlayer().apply {
            videoSurface().set(f.videoSurfaces().newVideoSurface(sink, sink, true))
        }
    }
}

/** Receives VLC's decoded frames (BGRA) and hands the newest one to Compose. */
class FrameSink : BufferFormatCallback, RenderCallback {
    private val lock = Any()
    private var width = 0
    private var height = 0
    private var bytes = ByteArray(0)

    /** Counts frames; Compose redraws when it changes. */
    val frames = MutableStateFlow(0L)

    override fun getBufferFormat(sourceWidth: Int, sourceHeight: Int): BufferFormat {
        synchronized(lock) {
            width = sourceWidth
            height = sourceHeight
            bytes = ByteArray(sourceWidth * sourceHeight * 4)
        }
        return RV32BufferFormat(sourceWidth, sourceHeight)
    }

    override fun allocatedBuffers(buffers: Array<out ByteBuffer>) {}

    override fun display(mediaPlayer: MediaPlayer, nativeBuffers: Array<out ByteBuffer>, bufferFormat: BufferFormat) {
        val b = nativeBuffers[0]
        synchronized(lock) {
            b.rewind()
            b.get(bytes, 0, minOf(bytes.size, b.remaining()))
        }
        frames.value = frames.value + 1
    }

    /** A copy of the newest frame, or null before the first one. The caller closes it. */
    fun image(): Image? = synchronized(lock) {
        if (width == 0 || height == 0 || frames.value == 0L) null
        else Image.makeRaster(ImageInfo(width, height, ColorType.BGRA_8888, ColorAlphaType.OPAQUE), bytes, width * 4)
    }
}

/** One VLC player for one address or file. */
class VlcPlayback(private val mrl: String, private val live: Boolean, private val muted: Boolean) {
    val sink = FrameSink()
    private val player = Vlc.newPlayer(sink)
    /** Fires when playback ends or fails. */
    val ended = MutableSharedFlow<Unit>(extraBufferCapacity = 4)

    init {
        player?.events()?.addMediaPlayerEventListener(object : MediaPlayerEventAdapter() {
            override fun finished(mediaPlayer: MediaPlayer) { ended.tryEmit(Unit) }
            override fun error(mediaPlayer: MediaPlayer) { ended.tryEmit(Unit) }
        })
    }

    private fun options(): Array<String> {
        val o = mutableListOf<String>()
        // Live: RTSP over TCP and small buffers, like the TVs (CLAUDE.md, 2026-11-13).
        if (live) o += listOf(":rtsp-tcp", ":network-caching=300", ":live-caching=300")
        if (muted) o += ":no-audio"
        return o.toTypedArray()
    }

    fun play() {
        player?.media()?.play(mrl, *options())
    }

    /** Stops and starts again (the live watchdog and retries). */
    fun restart() {
        val p = player ?: return
        p.submit {
            p.controls().stop()
            p.media().play(mrl, *options())
        }
    }

    fun release() {
        val p = player ?: return
        // Releasing can block for a moment; keep it off the UI thread.
        thread(name = "vlc-release") { runCatching { p.controls().stop(); p.release() } }
    }
}

/** Draws a [FrameSink] fitted inside the area, with [bg] around it. */
@Composable
fun VideoSurface(sink: FrameSink, bg: Color, modifier: Modifier = Modifier.fillMaxSize()) {
    val frame by sink.frames.collectAsState()
    Canvas(modifier.background(bg)) {
        if (frame == 0L) return@Canvas
        val img = sink.image() ?: return@Canvas
        val scale = minOf(size.width / img.width, size.height / img.height)
        val w = img.width * scale
        val h = img.height * scale
        val left = (size.width - w) / 2
        val top = (size.height - h) / 2
        drawIntoCanvas {
            it.nativeCanvas.drawImageRect(
                img,
                Rect.makeWH(img.width.toFloat(), img.height.toFloat()),
                Rect.makeXYWH(left, top, w, h),
                FilterMipmap(FilterMode.LINEAR, MipmapMode.NONE),
                null,
                true,
            )
        }
        img.close()
    }
}

/** An MP4 slide or any one-shot video: plays once, muted, and calls [onEnded] at the end. */
@Composable
fun VlcVideo(mrl: String, bg: Color, muted: Boolean, live: Boolean, onEnded: () -> Unit) {
    if (!Vlc.available) {
        Box(Modifier.fillMaxSize().background(bg), contentAlignment = Alignment.Center) {
            T("Videos need VLC, which wasn't found.", 30, color = Color.White.copy(alpha = 0.8f))
        }
        return
    }
    val pb = remember(mrl, muted, live) { VlcPlayback(mrl, live, muted) }
    val ended by rememberUpdatedState(onEnded)
    DisposableEffect(pb) {
        pb.play()
        onDispose { pb.release() }
    }
    LaunchedEffect(pb) { pb.ended.collect { ended() } }
    VideoSurface(pb.sink, bg)
}
