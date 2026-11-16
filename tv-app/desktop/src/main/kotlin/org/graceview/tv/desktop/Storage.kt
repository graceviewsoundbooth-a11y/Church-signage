package org.graceview.tv.desktop

import org.graceview.tv.Config
import org.graceview.tv.data.CoreLog
import java.io.File
import java.time.LocalDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Properties

/** %APPDATA%\GraceviewTV: the Sheet cache, slides, logos, settings and the log. */
object Storage {
    val dir: File = File(System.getenv("APPDATA") ?: System.getProperty("user.home"), "GraceviewTV").apply { mkdirs() }
}

/** Settings that belong to this PC: the device name and which monitor to use. */
object Prefs {
    private val file = File(Storage.dir, "settings.properties")
    private val props = Properties().apply { if (file.exists()) runCatching { file.inputStream().use { load(it) } } }

    var device: String?
        get() = props.getProperty("device")?.takeIf { it.isNotBlank() }
        set(v) = put("device", v)

    var monitor: Int
        get() = props.getProperty("monitor")?.toIntOrNull() ?: -1
        set(v) = put("monitor", v.toString())

    @Synchronized private fun put(k: String, v: String?) {
        if (v == null) props.remove(k) else props.setProperty(k, v)
        runCatching { file.outputStream().use { props.store(it, "Graceview Event Screen") } }
    }
}

/** A small log file next to the settings (log.txt, then log.old.txt). Never log the API key. */
object DesktopLog {
    private val file = File(Storage.dir, "log.txt")
    private val fmt = DateTimeFormatter.ofPattern("MM-dd HH:mm:ss")

    fun init() {
        CoreLog.sink = CoreLog.Sink { level, tag, message, error -> write(level, tag, message, error) }
        write('I', "EventScreen", "Started ${BuildInfo.VERSION}", null)
    }

    fun i(tag: String, message: String) = write('I', tag, message, null)
    fun w(tag: String, message: String, error: Throwable? = null) = write('W', tag, message, error)

    @Synchronized private fun write(level: Char, tag: String, message: String, error: Throwable?) {
        val line = "${LocalDateTime.now().format(fmt)} $level/$tag: ${message.replace(Config.API_KEY.ifEmpty { "\u0000" }, "…")}" +
            (error?.let { " (${it.javaClass.simpleName}: ${it.message})" } ?: "")
        println(line)
        runCatching {
            if (file.length() > 1_000_000) file.renameTo(File(Storage.dir, "log.old.txt").also { it.delete() })
            file.appendText(line + "\n")
        }
    }
}

/** The time, with a test override (`--fakeNow 2026-11-15T15:05:00`) that then runs forward from there. */
object Clock {
    @Volatile private var offsetMs = 0L

    fun now(): ZonedDateTime = ZonedDateTime.now(Config.ZONE).plusNanos(offsetMs * 1_000_000)

    fun fake(local: String) {
        val target = LocalDateTime.parse(local).atZone(Config.ZONE)
        offsetMs = target.toInstant().toEpochMilli() - System.currentTimeMillis()
        DesktopLog.i("EventScreen", "Fake clock: $target")
    }
}
